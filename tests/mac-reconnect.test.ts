import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

// Execute the actual chat catch-up callback, including its live refs, against
// missed-event scenarios. No provider, browser sleep or timing dependency.
const source = readFileSync(new URL("../components/chat.tsx", import.meta.url), "utf8");
const start = source.indexOf("const fetchJobs = useCallback(");
const end = source.indexOf("\n\tfetchJobsRef.current", start);
const callback = source.slice(start, end).replace(/ as \{ jobs\?: JobRecord\[\]; turnInFlight\?: boolean \}/, "");
const resync = source.match(/useServerResync\((\(\) => fetchJobsRef.current\([^\n]+)\);/)?.[1];

for (const scenario of [
	{ name: "a whole turn was missed with no jobs", running: false, local: false, attaching: false, syncs: 1, attaches: 0 },
	{ name: "a remote turn is still running", running: true, local: false, attaching: false, syncs: 0, attaches: 1 },
	{ name: "our own stream still owns the view", running: false, local: true, attaching: false, syncs: 0, attaches: 0 },
	{ name: "an attachment is already in progress", running: true, local: false, attaching: true, syncs: 0, attaches: 0 },
]) test(`Mac reconnect: ${scenario.name}`, async () => {
	let syncs = 0; let attaches = 0; let pending: Promise<void> | undefined;
	const fetchJobsRef = { current: (_reconnect?: boolean) => {} };
	const context = vm.createContext({
		useCallback: (fn: unknown) => fn, chatId: "fixture",
		fetch: async () => ({ ok: true, json: async () => ({ jobs: [], turnInFlight: scenario.running }) }),
		localStreamRef: { current: scenario.local }, turnInFlightRef: { current: scenario.attaching },
		jobStatusRef: { current: new Map() }, firstFetchRef: { current: false }, pendingSyncRef: { current: false },
		syncFromServer: async () => { syncs++; }, attachToRunningTurn: () => { attaches++; },
		adoptAppendOnly: async () => {}, setJobs() {}, fetchJobsRef,
	});
	vm.runInContext(callback, context);
	fetchJobsRef.current = (reconnect) => { pending = vm.runInContext(`fetchJobs(${reconnect === true})`, context); };
	assert.ok(resync);
	vm.runInContext(`(${resync})()`, context);
	await pending;
	assert.equal(syncs, scenario.syncs);
	assert.equal(attaches, scenario.attaches);
});
