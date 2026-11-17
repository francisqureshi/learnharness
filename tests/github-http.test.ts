import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-github-http-"));
process.env.LH_AUTH_FILE = path.join(directory, "auth.json");
process.env.LH_DATA_DIR = path.join(directory, "data");
delete process.env.LH_DESKTOP_SERVER; delete process.env.LH_DESKTOP_API_SECRET;
after(() => fs.rmSync(directory, { recursive: true, force: true }));
const { githubControlsResponse, githubCallbackResponse, githubRegistrationResponse } = await import("../src/server/github-http.ts");
const { subscriptionBrowserResponse } = await import("../src/server/web-subscription-http.ts");
const origin = "https://hws.example.test:10443";
function request(op?: string) {
 return new Request(`${origin}/api/github`, { method: op ? "POST" : "GET", headers: { origin, "x-learnharness-github": "1", "Content-Type": "application/json" }, body: op ? JSON.stringify({ op }) : undefined });
}
test("controls reject cross-origin/oversized commands and don't return credentials", async () => {
 const foreign = request("setup"); foreign.headers.set("origin", "https://evil.test");
 assert.equal((await githubControlsResponse(foreign)).status, 403);
 const noHeader = request(); noHeader.headers.delete("x-learnharness-github");
 assert.equal((await githubControlsResponse(noHeader)).status, 403);
 const huge = new Request(`${origin}/api/github`, { method: "POST", headers: request().headers, body: JSON.stringify({ op: "setup", padding: "a".repeat(2000) }) });
 assert.equal((await githubControlsResponse(huge)).status, 413);
 const status = await (await githubControlsResponse(request())).json();
 assert.deepEqual(status, { configured: false, connected: false });
 assert.equal((await githubCallbackResponse(new Request(`${origin}/api/github/callback?code=bad&state=bad`), "login")).status, 400);
});
test("registration traverses the existing native opener with one-use HTTPS redirect then form", async () => {
 const start = await (await githubControlsResponse(request("setup"))).json();
 assert.match(start.browserAction, /^\/api\/subscriptions\/browser\?id=/);
 const open = new Request(`${origin}${start.browserAction}`, { method: "POST", headers: { origin, "x-learnharness-subscriptions": "1" } });
 const response = await subscriptionBrowserResponse(open);
 assert.equal(response.status, 303);
 const target = response.headers.get("location")!;
 assert.ok(target.startsWith(`${origin}/api/github/registration?id=`));
 const page = githubRegistrationResponse(new Request(target));
 assert.equal(page.status, 200); const html = await page.text();
 assert.ok(html.includes("https://github.com/settings/apps/new"));
 assert.ok(html.includes("pull_requests")); assert.ok(html.includes("&quot;read&quot;"));
 assert.equal(githubRegistrationResponse(new Request(target)).status, 410);
 assert.equal((await subscriptionBrowserResponse(open)).status, 410);
});
test("disconnect invalidates pending browser actions", async () => {
 const start = await (await githubControlsResponse(request("setup"))).json();
 await githubControlsResponse(request("disconnect"));
 const response = await subscriptionBrowserResponse(new Request(`${origin}${start.browserAction}`, { headers: { "sec-fetch-site": "same-origin" } }));
 assert.equal(response.status, 410);
});
