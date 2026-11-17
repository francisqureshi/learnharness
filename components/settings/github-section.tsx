"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Status = { configured: boolean; connected: boolean; login?: string };
const headers = { "Content-Type": "application/json", "x-learnharness-github": "1" };
async function command(op: string) {
 const response = await fetch("/api/github", { method: "POST", headers, body: JSON.stringify({ op }) });
 const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "GitHub request failed."); return result;
}
export function GitHubSection() {
 const [status, setStatus] = useState<Status>();
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const [repos, setRepos] = useState<{ repositories: string[]; total: number }>();
 const refresh = useCallback(async () => {
  try { const r = await fetch("/api/github", { headers, cache: "no-store" }); if (!r.ok) throw new Error("GitHub status unavailable."); setStatus(await r.json()); }
  catch (e) { setError(e instanceof Error ? e.message : "GitHub status unavailable."); }
 }, []);
 useEffect(() => { void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
  window.addEventListener("focus", refresh); return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
 }, [refresh]);
 const open = async (op: string) => {
  const external = window.lh?.subscriptionTransport === "web" ? window.lh.openSubscriptionBrowser : undefined;
  const tab = external ? null : window.open("about:blank", "_blank");
  if (!external && !tab) { setError("Allow a browser tab to open, then try again."); return; }
  if (tab) tab.opener = null;
  setBusy(true); setError("");
  try { const result = await command(op);
   if (!/^\/api\/subscriptions\/browser\?id=[0-9a-f-]{36}$/.test(result.browserAction)) throw new Error("Invalid GitHub sign-in action.");
   if (external) await external(result.browserAction); else if (tab) tab.location.href = result.browserAction;
  } catch (e) { tab?.close(); setError(e instanceof Error ? e.message : "Could not open GitHub."); }
  finally { setBusy(false); }
 };
 return <div className="space-y-4" data-testid="github-settings">
  <p className="text-sm text-muted-foreground">Connect once, then ask about your repositories in any conversation. Read code, issues and pull requests with source links.</p>
  <p className="text-sm">{status?.connected ? `Connected as ${status.login}` : status?.configured ? "Choose repositories on GitHub, then sign in." : "Create a private GitHub App under your account to choose which repositories LearnHarness may read."}</p>
  <div className="flex flex-wrap gap-2">
   {!status?.configured ? <Button disabled={busy || !status} onClick={() => void open("setup")}>Set up GitHub</Button> : <>
    <Button variant="outline" disabled={busy} onClick={() => void open(status.connected ? "manage" : "install")}>{status.connected ? "Manage access" : "Choose repositories"}</Button>
    <Button disabled={busy} onClick={() => void open("login")}>{status.connected ? "Reconnect GitHub" : "Connect GitHub"}</Button>
   </>}
   {status?.connected && <>
    <Button variant="outline" disabled={busy} onClick={async () => { setError(""); try { setRepos(await command("repositories")); } catch (e) { setError(e instanceof Error ? e.message : "Could not list repositories."); } }}>Show repositories</Button>
    <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await command("disconnect"); setRepos(undefined); await refresh(); } catch { setError("Could not disconnect GitHub."); } finally { setBusy(false); } }}>Disconnect</Button>
   </>}
  </div>
  {repos && <div className="text-sm"><p>{repos.total} permitted repositories</p><ul className="mt-2 space-y-1 break-words">{repos.repositories.map(repo => <li key={repo}>{repo}</li>)}</ul>{repos.total > repos.repositories.length && <p>Showing the first {repos.repositories.length}; all permitted repositories are available in conversation.</p>}</div>}
  <p className="text-xs text-muted-foreground">Read-only access shared by clients connected to this server. Relevant excerpts are sent to your lesson’s AI provider. Disconnecting stops new reads; excerpts already saved in lessons remain.</p>
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
}
