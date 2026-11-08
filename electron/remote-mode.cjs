"use strict";
const HWS_ORIGIN = "https://hws.tail0d91b.ts.net:10443";
function remoteMode(metadata) {
	if (metadata.lhRemoteOrigin === undefined) return null;
	if (metadata.lhRemoteOrigin !== HWS_ORIGIN) throw new Error("Unexpected LearnHarness hws server origin.");
	return Object.freeze({ origin: HWS_ORIGIN, name: "LearnHarness hws" });
}
module.exports = { remoteMode };
