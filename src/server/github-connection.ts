import fs from "node:fs";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { AUTH_FILE } from "../../config.ts";
import { writeFileAtomicSync } from "../store/atomic-write.ts";

interface Credentials {
 appId: number; clientId: string; clientSecret: string; slug: string; origin: string;
 token?: string; refreshToken?: string; expiresAt?: number; login?: string;
}
type Pending = { state: string; verifier: string; origin: string; kind: "setup" | "login"; until: number; generation: number };
export const GITHUB_PERMISSIONS = { contents: "read", issues: "read", pull_requests: "read", metadata: "read" };
export class GitHubConnection {
 private pending?: Pending;
 private generation = 0;
 private refreshing?: Promise<string>;
 constructor(private file: string, private fetcher: typeof fetch = fetch) {}
 private load(): Credentials | undefined {
  try { return JSON.parse(fs.readFileSync(this.file, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw new Error("GitHub connection could not be read."); }
 }
 private save(value: Credentials) {
  fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
  writeFileAtomicSync(this.file, JSON.stringify(value), { mode: 0o600 });
 }
 connected() { try { return !!this.load()?.token; } catch { return false; } }
 status() {
  const c = this.load();
  return { configured: !!c, connected: !!c?.token, login: c?.login,
   installationUrl: c ? `https://github.com/apps/${c.slug}/installations/new` : undefined,
   manageUrl: c ? "https://github.com/settings/installations" : undefined };
 }
 async json(url: string, init: RequestInit = {}): Promise<any> {
  const response = await this.fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000),
   headers: { Accept: "application/vnd.github+json", "User-Agent": "LearnHarness", ...init.headers } });
  if (!response.ok) {
   await response.body?.cancel();
   if (response.status === 401) throw new Error("GitHub connection expired or was revoked. Reconnect in Settings → GitHub.");
   if (response.status === 403 || response.status === 429) throw new Error("GitHub denied access or its rate limit was reached. Check repository access or try later.");
   if (response.status === 404) throw new Error("GitHub resource is unavailable or not permitted.");
   throw new Error(`GitHub request failed (${response.status}).`);
  }
  const reader = response.body?.getReader(); if (!reader) throw new Error("Empty GitHub response.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length;
   if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("GitHub response too large; narrow the request."); } chunks.push(r.value);
  } } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Invalid GitHub response."); }
 }
 begin(kind: "setup" | "login", origin: string) {
  const c = this.load();
  if (kind === "setup" && c) throw new Error("GitHub App is already registered.");
  if (kind === "login" && (!c || c.origin !== origin)) throw new Error("Open GitHub settings at the server address used for setup.");
  const state = randomBytes(32).toString("hex"), verifier = randomBytes(32).toString("base64url");
  this.generation++;
  this.pending = { state, verifier, origin, kind, until: Date.now() + 10 * 60_000, generation: this.generation };
  if (kind === "setup") return {
   action: `https://github.com/settings/apps/new?state=${state}`,
   manifest: { name: `LearnHarness-${randomBytes(4).toString("hex")}`, url: origin,
    description: "Read selected repositories, issues and pull requests for learning conversations.",
    redirect_url: `${origin}/api/github/setup`, callback_urls: [`${origin}/api/github/callback`],
    hook_attributes: { active: false, url: `${origin}/api/github/unused-webhook` },
    public: false, default_permissions: GITHUB_PERMISSIONS, default_events: [] },
  };
  const query = new URLSearchParams({ client_id: c!.clientId, redirect_uri: `${origin}/api/github/callback`, state,
   code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", scope: "offline_access" });
  return { url: `https://github.com/login/oauth/authorize?${query}` };
 }
 private async exchange(c: Credentials, fields: Record<string, string>) {
  const data = await this.json("https://github.com/login/oauth/access_token", { method: "POST",
   headers: { Accept: "application/json", "Content-Type": "application/json" },
   body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, ...fields }) });
  if (typeof data.access_token !== "string" || !data.access_token.startsWith("ghu_")) throw new Error("GitHub authorization failed. Reconnect in Settings → GitHub.");
  return { ...c, token: data.access_token, refreshToken: data.refresh_token,
   expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined } as Credentials;
 }
 async complete(kind: "setup" | "login", state: string, code: string, origin: string) {
  const p = this.pending;
  if (!p || p.kind !== kind || p.origin !== origin || p.until < Date.now() || p.state !== state || !/^[\w-]{1,256}$/.test(code)) throw new Error("GitHub sign-in expired or is invalid. Start again from Settings → GitHub.");
  this.pending = undefined;
  const current = () => { if (p.generation !== this.generation) throw new Error("GitHub connection was cancelled."); };
  if (kind === "setup") {
   const data = await this.json(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, { method: "POST" });
   if (!Number.isSafeInteger(data.id) || typeof data.client_id !== "string" || typeof data.client_secret !== "string" || !/^[a-z0-9-]+$/.test(data.slug)) throw new Error("Invalid GitHub App registration.");
   current(); this.save({ appId: data.id, clientId: data.client_id, clientSecret: data.client_secret, slug: data.slug, origin });
  } else {
   const c = this.load(); if (!c) throw new Error("Register the GitHub App first.");
   const next = await this.exchange(c, { code, code_verifier: p.verifier, redirect_uri: `${origin}/api/github/callback` });
   const user = await this.json("https://api.github.com/user", { headers: { Authorization: `Bearer ${next.token}` } });
   current(); this.save({ ...next, login: user.login });
  }
 }
 disconnect() {
  this.generation++; this.pending = undefined;
  const c = this.load(); if (c) this.save({ appId: c.appId, clientId: c.clientId, clientSecret: c.clientSecret, slug: c.slug, origin: c.origin });
 }
 private async token(): Promise<string> {
  const c = this.load(); if (!c?.token) throw new Error("Connect GitHub in Settings → GitHub first.");
  if (!c.expiresAt || c.expiresAt > Date.now() + 60_000) return c.token;
  if (!c.refreshToken) throw new Error("Reconnect GitHub in Settings → GitHub.");
  if (!this.refreshing) {
   const generation = this.generation;
   this.refreshing = (async () => {
    const next = await this.exchange(c, { grant_type: "refresh_token", refresh_token: c.refreshToken! });
    if (generation !== this.generation) throw new Error("GitHub disconnected.");
    this.save(next); return next.token!;
   })().finally(() => { this.refreshing = undefined; });
  }
  return this.refreshing;
 }
 async get(endpoint: string) {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//")) throw new Error("Invalid GitHub endpoint.");
  const generation = this.generation;
  const token = await this.token();
  if (generation !== this.generation) throw new Error("GitHub disconnected.");
  const result = await this.json(`https://api.github.com${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  if (generation !== this.generation) throw new Error("GitHub disconnected.");
  return result;
 }
 async repositories(page = 1) {
  const c = this.load(); if (!c?.token) throw new Error("Connect GitHub in Settings → GitHub first.");
  // The private App is installed on its owner's account. Check the live installation
  // every time so removal/permission changes cannot leave a stale local allowlist.
  const installs = await this.get("/user/installations?per_page=100");
  const install = installs.installations.find((i: any) => i.app_id === c.appId && !i.suspended_at);
  if (!install) throw new Error("Choose repositories using Manage access in Settings → GitHub.");
  if (Object.keys(GITHUB_PERMISSIONS).some(key => install.permissions?.[key] !== "read") || Object.entries(install.permissions ?? {}).some(([key, value]) => !(key in GITHUB_PERMISSIONS) || value !== "read")) throw new Error("The GitHub App must have only read-only contents, issues, pull requests and metadata permissions.");
  return this.get(`/user/installations/${install.id}/repositories?per_page=100&page=${page}`);
 }
}
const shared = globalThis as typeof globalThis & { lhGitHubConnection?: GitHubConnection };
export function githubConnection() {
 return shared.lhGitHubConnection ??= new GitHubConnection(path.join(path.dirname(AUTH_FILE), "github-repositories-credentials.json"));
}
