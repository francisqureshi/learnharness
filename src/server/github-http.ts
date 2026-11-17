import { randomUUID } from "node:crypto";
import { githubConnection } from "./github-connection.ts";
import { subscriptionRequestOrigin } from "./request-origin.ts";
const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const global = globalThis as typeof globalThis & { lhGitHubBrowser?: Map<string, { origin: string; until: number; response: Response }> };
const actions = global.lhGitHubBrowser ??= new Map();
function html(body: string, status = 200) {
 return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>LearnHarness GitHub</title><main><h1>LearnHarness · GitHub</h1>${body}</main>`,
  { status, headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; form-action https://github.com; base-uri 'none'; frame-ancestors 'none'" } });
}
function error(message: string, status: number) { return Response.json({ error: message }, { status, headers: HEADERS }); }
export async function githubControlsResponse(request: Request) {
 const origin = subscriptionRequestOrigin(request);
 if (!origin || request.headers.get("x-learnharness-github") !== "1" || request.headers.get("sec-fetch-site") === "cross-site" ||
  (request.method !== "GET" && request.headers.get("origin") !== origin) ||
  (request.headers.has("origin") && request.headers.get("origin") !== origin)) return error("Use GitHub controls in LearnHarness Settings.", 403);
 const connection = githubConnection();
 try {
  if (request.method === "GET") return Response.json(connection.status(), { headers: HEADERS });
  if (request.method !== "POST") return error("Unsupported method.", 405);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return error("Expected JSON.", 415);
  // Only a tiny enum command is accepted; bound streamed input before parsing.
  const reader = request.body?.getReader(); if (!reader) return error("Expected command.", 400);
  let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length;
   if (size > 1024) { await reader.cancel(); return error("Request too large.", 413); } chunks.push(r.value);
  } } finally { reader.releaseLock(); }
  const { op } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (op === "disconnect") { connection.disconnect(); actions.clear(); return Response.json(connection.status(), { headers: HEADERS }); }
  if (op === "repositories") {
   const r = await connection.repositories();
   return Response.json({ total: r.total_count, repositories: r.repositories.map((x: any) => x.full_name) }, { headers: HEADERS });
  }
  if (!["setup", "login", "install", "manage"].includes(op)) return error("Unsupported command.", 400);
  for (const [id, action] of actions) if (action.until < Date.now()) actions.delete(id);
  if (actions.size >= 14) actions.clear();
  let response: Response;
  if (op === "setup") {
   const result = connection.begin("setup", origin);
   if (!("manifest" in result)) throw new Error("Setup unavailable.");
   const form = html(`<p>Create your private GitHub App, then select repositories. It requests read-only code, issues and pull request access.</p><form method="post" action="${escape(result.action!)}"><input type="hidden" name="manifest" value="${escape(JSON.stringify(result.manifest))}"><button>Continue to GitHub</button></form>`);
   const formId = randomUUID();
   actions.set(formId, { origin, until: Date.now() + 60_000, response: form });
   response = new Response(null, { status: 303, headers: { ...HEADERS, Location: `${origin}/api/github/registration?id=${formId}` } });
  } else {
   const target = op === "login" ? connection.begin("login", origin).url : op === "install" ? connection.status().installationUrl : connection.status().manageUrl;
   if (!target) throw new Error("Set up GitHub first.");
   response = new Response(null, { status: 303, headers: { ...HEADERS, Location: target } });
  }
  const id = randomUUID(); actions.set(id, { origin, until: Date.now() + 60_000, response });
  return Response.json({ browserAction: `/api/subscriptions/browser?id=${id}` }, { headers: HEADERS });
 } catch (e) { return error(e instanceof Error && e.message.startsWith("GitHub") ? e.message : "GitHub connection could not be changed. Try again in Settings.", 400); }
}
/** Reuse the native shells' existing restricted sign-in opener. Tickets are
 * one-use and origin-bound; no shell changes or arbitrary URL opening needed. */
export function githubBrowserResponse(id: string, origin: string): Response | undefined {
 const action = actions.get(id); if (!action) return;
 actions.delete(id);
 if (action.origin !== origin || action.until < Date.now()) return error("GitHub browser action expired.", 410);
 return action.response;
}
export async function githubCallbackResponse(request: Request, kind: "setup" | "login") {
 const url = new URL(request.url), origin = subscriptionRequestOrigin(request);
 try {
  if (!origin) throw new Error("Invalid origin.");
  await githubConnection().complete(kind, url.searchParams.get("state") ?? "", url.searchParams.get("code") ?? "", origin);
  return html(`<p>${kind === "setup" ? "GitHub App created. Return to Settings → GitHub, choose repositories, then connect." : "GitHub connected. Return to LearnHarness and explore a repository in your conversation."}</p><p>You may close this tab.</p>`);
 } catch { return html("<p>GitHub connection could not be completed. Return to Settings → GitHub and start again.</p>", 400); }
}

export function githubRegistrationResponse(request: Request) {
 const origin = subscriptionRequestOrigin(request), id = new URL(request.url).searchParams.get("id");
 if (!origin || !id) return error("Registration link expired.", 410);
 return githubBrowserResponse(id, origin) ?? error("Registration link expired.", 410);
}
