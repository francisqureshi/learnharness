import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GitHubConnection, GITHUB_PERMISSIONS } from "../src/server/github-connection.ts";
import { createGitHubReader } from "../src/server/github-reader.ts";
import { githubTools } from "../src/agent/tools/github.ts";
import { isSensitivePath } from "../src/agent/tools/fs-shared.ts";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-github-test-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const origin = "https://hws.example.test:10443";
const config = { appId: 42, clientId: "client-fixture", clientSecret: "secret-fixture", slug: "fixture-app", origin, token: "ghu_fixture", login: "learner" };
let sequence = 0;
function harness(handler: (url: string, init: RequestInit) => any | Promise<any>, initial: object | null = config) {
 const file = path.join(scratch, `record-${sequence++}.json`);
 if (initial) fs.writeFileSync(file, JSON.stringify(initial));
 const calls: { url: string; init: RequestInit }[] = [];
 const fetcher: typeof fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const result = await handler(String(url), init);
  return result instanceof Response ? result : Response.json(result);
 };
 return { connection: new GitHubConnection(file, fetcher), file, calls };
}
function installation(url: string) {
 if (url.includes("/user/installations?")) return { installations: [{ id: 7, app_id: 42, permissions: GITHUB_PERMISSIONS }] };
 if (url.includes("/user/installations/7/repositories")) return { total_count: 1, repositories: [{ full_name: "learner/private", default_branch: "main" }] };
}
test("manifest only requests read permissions; state/origin enforced; secrets stay off status", async () => {
 const h = harness(() => ({ id: 42, slug: "fixture-app", client_id: config.clientId, client_secret: config.clientSecret, pem: "unused-private-key" }), null);
 const begin = h.connection.begin("setup", origin);
 assert.deepEqual(begin.manifest?.default_permissions, GITHUB_PERMISSIONS);
 const state = new URL(begin.action!).searchParams.get("state")!;
 await assert.rejects(h.connection.complete("setup", "wrong", "code", origin));
 await assert.rejects(h.connection.complete("setup", state, "code", "https://other.invalid"));
 assert.equal(h.calls.length, 0);
 await h.connection.complete("setup", state, "code", origin);
 assert.equal(fs.statSync(h.file).mode & 0o777, 0o600);
 assert.ok(!JSON.stringify(h.connection.status()).includes("secret-fixture"));
 assert.ok(!fs.readFileSync(h.file, "utf8").includes("unused-private-key"));
 await assert.rejects(h.connection.complete("setup", state, "code", origin));
});
test("OAuth uses PKCE and persists connection; disconnect strips tokens and cancels state", async () => {
 let verifier = "";
 const h = harness((url, init) => {
  if (url.endsWith("/user")) return { login: "learner" };
  const body = JSON.parse(init.body as string); verifier = body.code_verifier;
  assert.equal(body.redirect_uri, `${origin}/api/github/callback`);
  return { access_token: "ghu_new", refresh_token: "ghr_refresh", expires_in: 28800 };
 }, { ...config, token: undefined });
 const begin = h.connection.begin("login", origin), url = new URL(begin.url!);
 assert.equal(url.searchParams.get("code_challenge_method"), "S256");
 await h.connection.complete("login", url.searchParams.get("state")!, "code", origin);
 assert.ok(verifier.length >= 43); assert.equal(h.connection.status().connected, true);
 assert.equal(h.connection.status().login, "learner");
 const second = h.connection.begin("login", origin); h.connection.disconnect();
 await assert.rejects(h.connection.complete("login", new URL(second.url!).searchParams.get("state")!, "code", origin));
 assert.ok(!fs.readFileSync(h.file, "utf8").includes("ghu_"));
 assert.equal(h.connection.status().configured, true);
});
test("refresh is single-flight and a disconnect cannot resurrect credentials", async () => {
 let release!: (value: any) => void;
 const h = harness(url => url.includes("access_token") ? new Promise(resolve => { release = resolve; }) : {} ,
  { ...config, expiresAt: 1, refreshToken: "ghr_fixture" });
 const one = h.connection.get("/user"), two = h.connection.get("/user");
 assert.equal(h.calls.length, 1);
 h.connection.disconnect(); release({ access_token: "ghu_refreshed", expires_in: 28800 });
 const results = await Promise.allSettled([one, two]);
 assert.ok(results.every(r => r.status === "rejected")); assert.equal(h.connection.connected(), false);
 assert.equal(h.calls.length, 1);
});
test("unselected repo is rejected before content access; changed write permissions fail closed", async () => {
 const h = harness(url => installation(url));
 await assert.rejects(createGitHubReader(h.connection).read({ action: "tree", repo: "learner/other" }), /not permitted/);
 assert.ok(h.calls.every(c => !c.url.includes("/repos/")));
 const bad = harness(() => ({ installations: [{ id: 7, app_id: 42, permissions: { ...GITHUB_PERMISSIONS, contents: "write" } }] }));
 await assert.rejects(bad.connection.repositories(), /read-only/);
});
test("code reads pin a commit per exploration, paginate lines and skip symlinks", async () => {
 let resolves = 0;
 const sha = "a".repeat(40);
 const h = harness(url => {
  const list = installation(url); if (list) return list;
  if (url.includes("/commits/")) { resolves++; return { sha }; }
  if (url.includes("/git/trees/")) return { tree: [{ path: "src/main.ts", type: "blob", mode: "100644", size: 100, sha: "blob1" }, { path: "link", type: "blob", mode: "120000", sha: "blob2" }] };
  if (url.includes("/git/blobs/blob1")) return { encoding: "base64", content: Buffer.from(Array.from({ length: 205 }, (_, i) => `line ${i + 1}`).join("\n")).toString("base64") };
  throw new Error(`Unexpected request ${url}`);
 });
 const reader = createGitHubReader(h.connection);
 await reader.read({ action: "tree", repo: "learner/private" });
 const file: any = await reader.read({ action: "read_file", repo: "learner/private", path: "src/main.ts", page: 2 });
 assert.equal(file.commit, sha); assert.match(file.content, /^201: line 201/); assert.equal(resolves, 1);
 await assert.rejects(reader.read({ action: "read_file", repo: "learner/private", path: "link" }), /Symlinks/);
 assert.ok(!h.calls.some(c => c.url.includes("blob2")));
 await createGitHubReader(h.connection).read({ action: "tree", repo: "learner/private" }); assert.equal(resolves, 2);
});
test("bounded literal search reports continuation and never follows symlinks", async () => {
 const h = harness(url => installation(url) ?? (url.includes("/commits/") ? { sha: "a".repeat(40) } : url.includes("/git/trees/") ?
  { truncated: true, tree: Array.from({ length: 16 }, (_, i) => ({ path: `${i}.ts`, type: "blob", mode: "100644", sha: `blob${i}`, size: 100 })) } :
  { encoding: "base64", content: Buffer.from("target").toString("base64") }));
 const result: any = await createGitHubReader(h.connection).read({ action: "search_code", repo: "learner/private", query: "target" });
 assert.equal(result.scanned, 15); assert.equal(result.nextPage, 2); assert.equal(result.treeTruncated, true);
 assert.equal(h.calls.filter(c => c.url.includes("/git/blobs/")).length, 15);
});
test("issue search remains repo-scoped; PR comments/reviews/diffs paginate read-only", async () => {
 const h = harness(url => installation(url) ?? (url.includes("/search/issues") ? { total_count: 2, items: [
  { title: "allowed", repository_url: "https://api.github.com/repos/learner/private" },
  { title: "outside", repository_url: "https://api.github.com/repos/learner/other" },
 ] } : [{ body: "Review", patch: "@@ diff", filename: "src.ts" }]));
 const reader = createGitHubReader(h.connection);
 const found: any = await reader.read({ action: "issues", repo: "learner/private", query: 'repo:learner/other "escape"' });
 assert.equal(found.items.length, 1);
 for (const part of ["comments", "reviews", "review_comments", "files"] as const) {
  await reader.read({ action: "pull_request", repo: "learner/private", number: 7, part, page: 2 });
 }
 assert.ok(h.calls.some(c => c.url.includes("/issues/7/comments?per_page=20&page=2")));
 assert.ok(h.calls.some(c => c.url.includes("/pulls/7/files?per_page=20&page=2")));
 assert.ok(h.calls.every(c => !c.init.method || c.init.method === "GET"));
});
test("credential file and atomic temporary are denied to learner filesystem tools", () => {
 const auth = "/private/auth.json";
 for (const name of ["github-repositories-credentials.json", "github-repositories-credentials.json.tmp-01234567-1234-4234-8234-123456789abc"]) {
  assert.ok(isSensitivePath(`/private/${name}`, "/home/test", auth));
 }
});
test("GitHub tool is absent without connection and delegates through the injected reader", async () => {
 assert.deepEqual(githubTools(), []);
 let called = false;
 const [tool] = githubTools({ read: async q => { called = true; assert.equal(q.action, "repos"); return { repositories: ["learner/private"] }; } });
 const r = await tool!.execute("id", { action: "repos" });
 assert.equal(called, true); assert.ok(JSON.stringify(r).includes("learner/private"));
});
test("researcher public fetch never forwards GitHub URLs to a reader service when connected", async () => {
 const { createWebTools } = await import("../src/agent/tools/web.ts");
 const tool = createWebTools(() => null, true).web_fetch!;
 const result = await tool.execute("id", { url: "https://github.com/learner/private/issues/7" });
 assert.ok(JSON.stringify(result).includes("authenticated github tool"));
});
