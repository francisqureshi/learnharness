import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadResponse, activeUploads, uploadsStatusResponse } from "../src/server/uploads.ts";
import { MAX_UPLOAD_BYTES } from "../lib/upload-limits.ts";

const origin = "https://hws.tail0d91b.ts.net:10443";
function request(name: string, body: BodyInit = "lesson fixture", overrides: Record<string, string> = {}) {
	return new Request(`${origin}/api/uploads`, { method: "POST", body, duplex: "half", headers: {
		origin, "x-learnharness-upload": "1", "x-file-name": encodeURIComponent(name), ...overrides,
	} } as RequestInit);
}
test("uploads retain private independent copies and clean up rejected/aborted streams", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "lh-upload-test-"));
	const previous = process.env.LH_SHARED_SERVER;
	process.env.LH_SHARED_SERVER = "1";
	try {
		for (const name of ["../escape.txt", "a/b", "a\\b", ".", "..", "\u0000", ""]) {
			assert.equal((await uploadResponse(request(name), root)).status, 400);
		}
		assert.equal((await uploadResponse(request("notes.txt", "x", { origin: "https://evil.invalid" }), root)).status, 403);
		assert.equal((await uploadResponse(request("notes.txt", "x", { "sec-fetch-site": "cross-site" }), root)).status, 403);
		assert.equal((await uploadResponse(request("notes.txt", "x", { "x-learnharness-upload": "" }), root)).status, 403);
		assert.deepEqual(await readdir(root), []);
		const a = await uploadResponse(request("résumé notes.txt"), root);
		assert.equal(a.status, 201);
		const first = await a.json();
		const second = await (await uploadResponse(request("résumé notes.txt", "new content"), root)).json();
		assert.notEqual(first.path, second.path);
		assert.equal(await readFile(first.path, "utf8"), "lesson fixture");
		assert.equal(await readFile(second.path, "utf8"), "new content");
		assert.equal((await stat(first.path)).mode & 0o777, 0o600);
		assert.equal((await stat(path.dirname(first.path))).mode & 0o777, 0o700);
		const empty = await uploadResponse(new Request(`${origin}/api/uploads`, { method: "POST", headers: { origin, "x-learnharness-upload": "1", "x-file-name": "empty.txt", "content-length": "0" } }), root);
		assert.equal(empty.status, 201);
		assert.equal((await empty.json()).size, 0);
		const before = await readdir(root);
		assert.equal((await uploadResponse(request("huge", "x", { "content-length": String(MAX_UPLOAD_BYTES + 1) }), root)).status, 413);
		let chunks = 0;
		let canceled = false;
		const oversized = new ReadableStream({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { canceled = true; } });
		assert.equal((await uploadResponse(request("huge", oversized), root)).status, 413);
		assert.equal(canceled, true);
		assert.ok(chunks <= 52);
		assert.deepEqual(await readdir(root), before);
		let release!: () => void;
		const pending = new Promise<void>((resolve) => { release = resolve; });
		const interrupted = new ReadableStream({ async pull(controller) { await pending; controller.error(new Error("Disconnected")); } });
		const uploading = uploadResponse(request("partial", interrupted), root);
		assert.equal(activeUploads(), 1);
		release();
		assert.equal((await uploading).status, 500);
		assert.equal(activeUploads(), 0);
		assert.deepEqual(await readdir(root), before);
		process.env.LH_SHARED_SERVER = "0";
		assert.equal((await uploadResponse(request("notes"), root)).status, 404);
	} finally {
		if (previous === undefined) delete process.env.LH_SHARED_SERVER; else process.env.LH_SHARED_SERVER = previous;
		await rm(root, { recursive: true, force: true });
	}
});


test("direct streaming route retains the desktop capability gate for GET and POST", async () => {
	const previous = process.env.LH_DESKTOP_SERVER;
	process.env.LH_DESKTOP_SERVER = "1";
	try {
		assert.equal((await uploadResponse(request("notes.txt"))).status, 403);
		assert.equal(uploadsStatusResponse(new Request(`${origin}/api/uploads`)).status, 403);
	} finally {
		if (previous === undefined) delete process.env.LH_DESKTOP_SERVER; else process.env.LH_DESKTOP_SERVER = previous;
	}
});
