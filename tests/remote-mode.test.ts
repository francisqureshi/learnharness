import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const { remoteMode } = require("../electron/remote-mode.cjs");
test("preview origin is fixed and local mode remains opt-in-free", () => {
	assert.equal(remoteMode({}), null);
	assert.equal(remoteMode({ lhRemoteOrigin: "https://hws.tail0d91b.ts.net:10443" }).name, "LearnHarness hws");
	for (const value of ["http://hws.tail0d91b.ts.net:10443", "https://evil.invalid", "https://hws.tail0d91b.ts.net:10443/", null]) assert.throws(() => remoteMode({ lhRemoteOrigin: value }));
});
test("remote preload exposes uploads and web subscriptions without Mac filesystem references", () => {
	let bridge: Record<string, unknown> = {};
	const ipc = { on() {}, removeListener() {}, invoke() {}, send() {} };
	vm.runInNewContext(readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8"), {
		process: { platform: "darwin", argv: ["--lh-web-subscriptions", "--lh-remote-uploads"] },
		require: () => ({ contextBridge: { exposeInMainWorld(_name: string, value: Record<string, unknown>) { bridge = value; } }, ipcRenderer: ipc, webUtils: { getPathForFile() { throw new Error("Must not read paths"); } } }),
	});
	assert.equal(bridge.attachmentTransport, "upload");
	assert.equal(bridge.subscriptionTransport, "web");
	assert.equal(bridge.getPathForFile, undefined);
	assert.equal(bridge.chooseAttachmentFolder, undefined);
});
