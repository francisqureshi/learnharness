import type { GitHubQuery, GitHubReader } from "../core/github.ts";
import { githubConnection, type GitHubConnection } from "./github-connection.ts";

const segment = (s: string) => encodeURIComponent(s);
const clipped = (s: unknown, limit = 20000) => typeof s === "string" && s.length > limit ? `${s.slice(0, limit)}\n[Truncated]` : s;
const summary = (x: any) => ({ number: x.number, title: x.title, state: x.state, url: x.html_url,
 body: clipped(x.body), user: x.user?.login, updated_at: x.updated_at, pull_request: !!x.pull_request });
/** One reader per foreground turn/research job: resolve each branch once, and
 * reuse its commit for consistent reads. Nothing is cloned or executed. */
export function createGitHubReader(connection: GitHubConnection = githubConnection()): GitHubReader {
 const refs = new Map<string, string>();
 return { async read(q) {
  const page = q.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error("Invalid page.");
  if (q.action === "repos") {
   const result = await connection.repositories(page);
   return { repositories: result.repositories.map((r: any) => ({ repo: r.full_name, description: r.description, default_branch: r.default_branch, url: r.html_url })), total: result.total_count, page, per_page: 100 };
  }
  if (!q.repo || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(q.repo) || q.repo.split("/").some(s => s === "." || s === "..")) throw new Error("Use an exact owner/repo from the permitted repositories. Ask the learner if ambiguous.");
  let allowed = false;
  for (let p = 1; p <= 100; p++) {
   const list = await connection.repositories(p);
   allowed = list.repositories.some((r: any) => r.full_name.toLowerCase() === q.repo!.toLowerCase());
   if (allowed || list.repositories.length < 100) break;
  }
  if (!allowed) throw new Error("This repository is not permitted. Choose it in Settings → GitHub → Manage access.");
  const base = `/repos/${q.repo.split("/").map(segment).join("/")}`;
  const url = `https://github.com/${q.repo}`;
  if (["tree", "read_file", "search_code"].includes(q.action)) {
   const key = `${q.repo}:${q.ref ?? "HEAD"}`;
   let sha = refs.get(key);
   if (!sha) { const commit = await connection.get(`${base}/commits/${segment(q.ref ?? "HEAD")}`); sha = commit.sha;
    if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error("GitHub returned an invalid commit."); refs.set(key, sha); }
   if (q.action === "read_file") {
    if (!q.path || q.path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Provide a repository-relative file path.");
    const tree = await connection.get(`${base}/git/trees/${sha}?recursive=1`);
    const entry = tree.tree.find((f: any) => f.path === q.path);
    if (!entry) throw new Error(tree.truncated ? "GitHub tree was truncated; this file could not be located." : "File not found at this commit.");
    if (entry.type !== "blob" || entry.mode === "120000" || entry.size > 1024 * 1024) throw new Error("Only text files up to 1 MiB can be read. Symlinks and submodules are not followed.");
    const file = await connection.get(`${base}/git/blobs/${entry.sha}`);
    if (file.encoding !== "base64") throw new Error("Unsupported file encoding.");
    const content = Buffer.from(file.content, "base64").toString("utf8");
    if (content.includes("\0")) throw new Error("Binary file; select a text file.");
    const lines = content.split("\n"), offset = (page - 1) * 200;
    return { repo: q.repo, commit: sha, url: `${url}/blob/${sha}/${q.path.split("/").map(segment).join("/")}#L${offset + 1}`, totalLines: lines.length, page,
     content: clipped(lines.slice(offset, offset + 200).map((line, i) => `${offset + i + 1}: ${line}`).join("\n")) };
   }
   const tree = await connection.get(`${base}/git/trees/${sha}?recursive=1`);
   const entries = tree.tree.filter((f: any) => !q.path || f.path.startsWith(q.path));
   if (q.action === "tree") return { repo: q.repo, commit: sha, url: `${url}/tree/${sha}`, page, total: entries.length, truncated: tree.truncated,
    entries: entries.slice((page - 1) * 200, page * 200).map((f: any) => ({ path: f.path, type: f.type, mode: f.mode, size: f.size })) };
   if (!q.query?.trim()) throw new Error("Provide literal text to search. Use path to narrow the scan.");
   // Bounded literal scan at the resolved commit, not GitHub's default-branch-only index.
   const files = entries.filter((f: any) => f.type === "blob" && f.mode !== "120000" && f.size <= 128 * 1024);
   const hits = []; const batch = files.slice((page - 1) * 15, page * 15);
   for (const f of batch) {
    const blob = await connection.get(`${base}/git/blobs/${f.sha}`);
    if (blob.encoding !== "base64") continue;
    const text = Buffer.from(blob.content, "base64").toString("utf8"); if (text.includes("\0")) continue;
    const matches = text.split("\n").flatMap((line, i) => line.toLowerCase().includes(q.query!.toLowerCase()) ? [{ line: i + 1, text: clipped(line, 400) }] : []).slice(0, 10);
    if (matches.length) hits.push({ path: f.path, url: `${url}/blob/${sha}/${f.path.split("/").map(segment).join("/")}`, matches });
   }
   return { repo: q.repo, commit: sha, hits, scanned: batch.length, totalEligibleFiles: files.length,
    nextPage: page * 15 < files.length ? page + 1 : null, treeTruncated: tree.truncated,
    note: "Literal case-insensitive scan; excludes binaries, symlinks and files over 128 KiB. Continue nextPage before claiming no matches." };
  }
  if (q.action === "issues" || q.action === "pull_requests") {
   if (q.query) {
    // User terms are quoted so they cannot escape the selected repository scope.
    const terms = q.query.replace(/["\\\r\n]/g, " ");
    const search = `repo:${q.repo} is:${q.action === "issues" ? "issue" : "pr"} "${terms}"`;
    const r = await connection.get(`/search/issues?q=${segment(search)}&per_page=20&page=${page}`);
    return { page, total: r.total_count, incomplete: r.incomplete_results, items: r.items.filter((x: any) => x.repository_url === `https://api.github.com${base}`).map(summary) };
   }
   const r = await connection.get(`${base}/${q.action === "issues" ? "issues" : "pulls"}?state=all&per_page=20&page=${page}`);
   return { page, items: r.filter((x: any) => q.action !== "issues" || !x.pull_request).map(summary), note: "Use the next page if this page is full or contains filtered pull requests." };
  }
  if (q.action !== "issue" && q.action !== "pull_request") throw new Error("Unknown GitHub read action.");
  if (!Number.isSafeInteger(q.number) || q.number! < 1) throw new Error("Provide an issue or pull request number.");
  const part = q.part ?? "details";
  const endpoint = part === "comments" ? `${base}/issues/${q.number}/comments` :
   q.action === "issue" && part === "details" ? `${base}/issues/${q.number}` :
   q.action === "pull_request" ? `${base}/pulls/${q.number}${part === "details" ? "" : part === "review_comments" ? "/comments" : part === "reviews" ? "/reviews" : part === "files" ? "/files" : "/invalid"}` : undefined;
  if (!endpoint || endpoint.endsWith("/invalid")) throw new Error("Unsupported issue/PR part.");
  const result = await connection.get(`${endpoint}?per_page=20&page=${page}`);
  return { fetchedAt: new Date().toISOString(), page, url: `${url}/${q.action === "issue" ? "issues" : "pull"}/${q.number}`,
   data: Array.isArray(result) ? result.map((x: any) => part === "files" ? { path: x.filename, status: x.status, patch: clipped(x.patch), url: x.blob_url, note: !x.patch ? "Patch unavailable; may be binary or too large." : undefined } :
    { body: clipped(x.body), user: x.user?.login, url: x.html_url, state: x.state, path: x.path, line: x.line, updated_at: x.updated_at }) :
    { ...summary(result), headCommit: result.head?.sha, baseCommit: result.base?.sha, merged: result.merged },
   note: Array.isArray(result) && result.length === 20 ? "More results may be available on the next page." : undefined };
 } };
}
