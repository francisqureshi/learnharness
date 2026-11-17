# GitHub exploration

Settings → GitHub connects one private GitHub App to the shared server. The owner
registers it through the prepared manifest, selects repositories on GitHub, then
uses Connect GitHub. No session attachment is needed: ask about an exact repo,
paste an issue/PR URL, or ask which repos are available.

The registration requests only repository contents, issues, pull requests and
metadata read access. It is private to its creator's account. Organisation and
GitHub Enterprise installations are outside this first version's scope.

## First connection

1. Open Settings → GitHub at the server's normal HTTPS address, with Tailscale
   connected. Choose Set up GitHub, Continue to GitHub, and approve creation.
2. Return to Settings and choose Choose repositories. Install on your personal
   account and select the repositories you want available.
3. Choose Connect GitHub and authorize. Return to Settings; the connected account
   appears automatically. Show repositories checks the current installation.
4. Ask a lesson to explore one of those repos. Relevant excerpts are sent to the
   configured lesson AI provider and retained in the lesson history.

The browser callbacks return to this same private server through the user's
browser. No public callback listener, webhook, SSH tunnel or pasted token is needed.
The existing Mac preview sign-in opener is reused; no wrapper reinstall is needed.

## Behaviour

The teacher, prober, practice agent and researcher receive the read-only `github`
tool when connected. Each foreground turn/research job resolves a requested
branch/tag once to a commit and reuses it for code reads. A later exploration can
resolve newer code. File results include commit URLs and line numbers. Repository
text is evidence, never instruction authority.

The tool lists permitted repositories, browses trees, reads paginated files,
performs bounded literal code searches and lists/searches issues and PRs. Detailed
issue/PR reads include bodies and comments; PRs also include reviews, inline review
comments and file patches. These records are fetched live, with fetch timestamps.
Pagination/truncation are explicit. There are no write or execution operations.

Literal search examines 15 text blobs per page, optionally restricted by a path
prefix, at the selected commit. It excludes symlinks, binaries and files over
128 KiB. It reports remaining pages and truncated GitHub trees. Individual file
reads support text up to 1 MiB, 200 lines per page, with a 20,000-character output
cap. Large/truncated trees and patches are reported rather than treated as complete.

Manage access opens GitHub installation settings. Every repository operation checks
live installation membership. Disconnect clears local tokens and invalidates pending
sign-in actions, retaining the App registration for reconnection. It does not delete
existing lesson excerpts or revoke the installation on GitHub; use Manage access to
remove the installation entirely.

## Server boundary

`github-repositories-credentials.json` lives beside `LH_AUTH_FILE`, written atomically
with mode 0600. It contains the App client secret and expiring user/refresh tokens;
no App private key is retained. It and its temporary files are denied to all learner
filesystem tools. The existing private state backups include this file; protect those
backups like other provider credentials. Neither status responses nor agent tools
return credentials.

OAuth uses single-use expiring state and PKCE. Browser controls require same-origin
requests. Native browser handoffs use origin-bound one-use tickets. Only fixed GitHub
HTTPS endpoints receive credentials, redirects are rejected, responses are bounded,
and concurrent refreshes share one request. Disconnect/replacement invalidates in-flight
credential writes. A server restart cancels unfinished sign-in; start again in Settings.

The shared-server trust model is unchanged: clients with access to this private
LearnHarness instance share its GitHub access. This is not per-user authentication.

## Validation

`NODE_ENV=test node_modules/.bin/tsx --test tests/github.test.ts tests/github-http.test.ts`
uses temporary stores and mocked GitHub responses; it makes no real registrations.
The mobile settings smoke test covers the new category. Live approval and a real
private-repository exploration remain deployment acceptance steps.
