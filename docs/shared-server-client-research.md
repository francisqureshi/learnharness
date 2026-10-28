# Shared-server client research

Research date: 2026-10-28. Source baseline: upstream commit
`3dd52110bbcbcba81645453ce0a8fdc230594c47`. This note examines the agreed
single-backend design: hws owns learning records and agent execution; the existing
Mac interface and a personal iPhone wrapper connect to it. It records findings and
proposed validation, not new product decisions or implementation approval.

Source links below refer to this checkout. Line numbers identify the inspected
version. The untracked `mobile/` directory is an earlier preview, not upstream
functionality. No application code was changed during this investigation.

## Findings that materially change the plan

1. **A remote Mac proof of concept has an existing entry point.** `LH_DEV_URL`
   skips local server startup, isolates the shell's user-data directory, and marks
   the preload subscription transport as web. This gives a useful spike without
   rewriting the lesson UI. It is still a development mode, not a supported
   production server selector. [Launcher](../electron/main.cjs#L112),
   [server selection](../electron/main.cjs#L649),
   [preload flag](../electron/main.cjs#L319).
2. **Remote subscription sign-in is not equivalent to API-key setup.** ChatGPT
   OAuth opens a callback listener on a random `127.0.0.1` port in the credential
   owner's process. With the owner on hws, completing that redirect in a browser
   on the Mac targets the wrong machine. Provider choice or a deliberately
   designed remote callback workflow is a prerequisite for promising this sign-in
   path. [Callback listener](../electron/chatgpt.cjs#L282),
   [web credential owner](../src/server/web-subscriptions.ts#L55).
3. **An unchanged packaged Mac build would retain upstream update behaviour.**
   Its release feed targets the upstream owner, automatic download/install is
   enabled, and the update preference reads the Mac's local data directory.
   A fork's remote mode must decide client update ownership and preference scope
   before distribution. [Release feed](../electron-builder.yml#L183),
   [local preference](../electron/main.cjs#L463),
   [automatic install](../electron/main.cjs#L506).
4. **The existing narrow-screen sidebar behaviour does not apply to iPhone.**
   Sidebar auto-collapse is explicitly Electron-only. A first-time plain browser
   starts with it open, and the Electron minimum width is 640px. Phone navigation
   needs an actual narrow-viewport test; do not count desktop auto-collapse as
   mobile support. [Sidebar defaults](../components/sidebar.tsx#L128),
   [Electron-only narrow handling](../components/sidebar.tsx#L139),
   [window dimensions](../electron/main.cjs#L335).
5. **Saved progress and unsent drafts are different scopes.** Question drafts
   live in a session-model `Map` and explicitly survive only the session mount;
   composer text is React state. Shared server records do not provide cross-device
   transfer of unfinished answers or typed-but-unsent text. This must be stated
   clearly in acceptance criteria or become an explicit additional requirement.
   [Question drafts](../components/session-core.ts#L243),
   [draft lifetime](../components/session-core.ts#L892),
   [composer](../components/chat.tsx#L550).
6. **Reconnect recovery needs a targeted regression test.** The event channel
   correctly calls resync listeners on reopening, but the chat's resync handler
   only fetches jobs. That job handler refreshes the transcript on known job
   transitions or previously deferred sync; it explicitly does not discover an
   in-flight turn. A suspended client that misses the start and settle of a
   teaching turn with no job transition appears able to remain stale until a
   later event/remount. This is a source-derived hypothesis, not a reproduced
   browser failure. [Event reopen](../components/server-events.tsx#L95),
   [job fetch conditions](../components/chat.tsx#L1048),
   [resync binding](../components/chat.tsx#L1109),
   [live turn handlers](../components/chat.tsx#L1132).

## Existing Mac shell: reuse and boundaries

The normal launcher starts the packaged Next server on loopback with
`LH_DATA_DIR`, `LH_AUTH_FILE`, a desktop API capability secret, and private IPC.
It also creates main-process ChatGPT and other subscription owners. The
`LH_DEV_URL` branch skips those owners and server creation. The preload still
exposes desktop bridges, but supplies `subscriptionTransport: "web"`; the React
subscription bridge then chooses same-origin HTTP rather than desktop IPC.
[Local startup](../electron/main.cjs#L201),
[mode branch](../electron/main.cjs#L652),
[preload](../electron/preload.cjs#L41),
[bridge selection](../components/settings/subscription-client.ts#L70).

The BrowserWindow already has context isolation, sandboxing, and disabled Node
integration. Permissions are matched against the loaded URL's exact origin;
navigation away from that origin goes to the system browser. Thus the code does
not inherently require a loopback origin even though some comments say loopback.
Production remote mode must preserve this exact-origin boundary and review every
IPC capability exposed to server-delivered content. The update-install and window
resize/zoom channels have different sender checks from subscription controls, so
the review should cover the whole preload rather than only sign-in.
[Window setup](../electron/main.cjs#L315),
[permissions/navigation](../electron/main.cjs#L343),
[IPC handlers](../electron/main.cjs#L690),
[update/resize channels](../electron/main.cjs#L718).

The web sign-in helper accepts only an opaque same-origin action URL, resolves it
through an authenticated-shape POST, and opens the returned HTTPS provider URL
externally. Reusing this is preferable to treating arbitrary URLs as trusted
commands, but production remote mode must deliberately enable and test it.
[Browser helper](../electron/web-subscription-browser.cjs#L6),
[main handler](../electron/main.cjs#L705).

## Credentials and provider controls

The Node web credential owner already persists connections beside the configured
API-key file and injects private provider leases into the agent runtime. It does
not return refresh tokens through a general HTTP credential endpoint. All
connected clients share this owner. It is one process per credential directory,
not a multi-user or multi-worker credential system.
[Owner implementation](../src/server/web-subscriptions.ts#L1),
[storage directory](../src/server/web-subscriptions.ts#L96),
[private runtime](../src/server/web-subscriptions.ts#L105).

API keys have environment-over-file precedence. Supplying a key in the service
environment can shadow edits made in the app's provider settings; the UI reports
that condition. The Nix plan must choose configuration handling with this
behaviour in mind, and must not embed secrets in derivations.
[Key precedence](../src/server/keys.ts#L5).

Subscription controls require same-origin request metadata and a custom header;
they explicitly are not user authentication. Their origin calculation uses the
request URL protocol and Host, not an arbitrary forwarded origin. A live probe
performed by the parent investigation against the current Tailscale HTTPS route,
using matching Origin/custom-header/JSON and an invalid provider identifier,
returned **400 Unsupported connection**, not 403. That demonstrates this route's
origin gate accepted that request without invoking a provider action; it does not
prove full OAuth or all proxy arrangements work.
[HTTP controls](../src/server/web-subscription-http.ts#L5).

For the iPhone wrapper, the web subscription UI calls `window.open` during the
user gesture and later redirects the reserved window. Native WebView behaviour
for this flow is untested. The Mac dev helper already avoids browser-tab
assumptions; the current Capacitor preview has no equivalent native sign-in
adapter. API-key setup and already-connected server-owned providers should be
tested separately from new sign-in on the phone.
[Web browser flow](../components/settings/subscription-client.ts#L27).
The local preview configuration was inspected at `mobile/configure.mjs:11`;
that prototype is uncommitted and is not part of the source baseline.

## Dictation

The desired architecture is already the implemented data path. The server reads
the permanent Deepgram key and requests a token with `ttl_seconds: 300`; the
client fetches it, captures mono audio, and opens a direct Deepgram WebSocket using
the bearer subprotocol. AudioWorklet output is sent to that socket. Final
transcript fragments are buffered into the input; ordinary lesson submission
sends the resulting text to the backend. There is no audio proxy through hws in
this code. [Token endpoint](../app/api/stt/token/route.ts#L17),
[client token](../components/dictation.tsx#L119),
[socket/transcript](../components/dictation.tsx#L350),
[capture](../components/dictation.tsx#L434).

The client retries an abnormal socket closure once using a fresh token, and caps
queued audio frames during connection gaps. This is bounded recovery, not a
guarantee of uninterrupted recording through device suspension. The existing
Electron origin permission gate and the preview's microphone usage description
are useful foundations; real iPhone/WebKit microphone permission, AudioContext
resume, worklet behaviour, lock/unlock, and transcript flushing remain validation
items. [Reconnect](../components/dictation.tsx#L384),
[buffer cap](../components/dictation.tsx#L467).
The microphone declaration was inspected in the uncommitted local prototype at
`mobile/ios/App/App/Info.plist:27`.

## Demos

The demo builder produces HTML/JS on the server and must run its verification loop
before returning it. Its runtime contract is one HTML document, with optional CDN
imports; it explicitly forbids localStorage, sessionStorage, and cookies in the
demo. The client receives that artifact and executes it in a `srcDoc` iframe with
`sandbox="allow-scripts"`, without same-origin access to the app. Moving the
backend to Linux therefore does not require moving interactive display out of
the Mac client or rewriting the demo card.
[Builder and contract](../src/agent/subagents/demo-builder.ts#L11),
[verification rule](../src/agent/subagents/demo-builder.ts#L66),
[iframe](../components/artifacts/demo-card.tsx#L211).

The injected bridge reports size and errors, validates the sending iframe window,
and clamps reported height at 2400px. These are relevant phone tests: a tall demo
can clip, and a demo that passes Chromium verification can still have Safari/touch
or narrow-layout problems. Server verification alone is not device compatibility
proof. Demo controls' internal state is not persisted by this bridge; the stored
UI preference shown here is brightness inversion, not the learner's slider/input
state. [Bridge](../components/artifacts/demo-card.tsx#L31),
[height clamp](../components/artifacts/demo-card.tsx#L62),
[stored inversion](../components/artifacts/demo-card.tsx#L142).

Linux renderer packaging needs separate runtime validation: the backend prefers
the Electron browser helper and falls back to `CHROME_PATH`/known Chrome paths;
the fallback currently launches with `--no-sandbox`. Its process/environment and
network isolation need review as part of the server work, not a UI change.
[Renderer resolution](../src/agent/subagents/headless.ts#L78),
[launch](../src/agent/subagents/headless.ts#L258).

## Validation slices to add to the issue plan

| Slice | Concrete evidence required | Existing starting point |
| --- | --- | --- |
| Remote Mac spike | Open the actual Electron shell against a private test server; no local backend writes; same lesson and artifacts visible | `LH_DEV_URL`, web subscription bridge |
| Production Mac mode | Chosen server configuration and failure UI; trusted-origin/IPC tests; explicit update ownership | Launcher, preload, updater tests |
| Shared lesson continuity | Mac → second client → Mac at a pending question; duplicate-answer race; active-turn detach/reattach | `tests/session-core.test.ts`, `tests/turn-liveness.test.ts` |
| Missed-event recovery | Disconnect a mounted idle client; finish a no-job turn elsewhere; reconnect and observe transcript refresh; repeat while other turn is still running | `components/chat.tsx` jobs/resync seams |
| Draft scope | Owner agrees whether only submitted state is shared; test documented boundary | In-memory question drafts and composer |
| Demo parity | Linux verification followed by actual Mac and iPhone interaction; CDN failure and oversized artifact handling | `tests/demos.test.tsx`, demo runtime payload checks |
| Dictation | Mac and iPhone permission, start/stop, final-word submission, one reconnect, lock/unlock | Dictation tests and token endpoint |
| Phone navigation | 390-ish pixel viewport with first-use sidebar, session picker, quiz and keyboard; no graph requirement | Sidebar and question dock |
| Provider setup | API-key path; already-connected subscription path; chosen new-sign-in workflow per provider | Web subscription suites |

## Server appendix: persistence, packaging and runtime evidence

The stores are not a transactional database. Chat JSON, job JSON, and settings
are written directly; a chat parse failure returns `null`. Graph ledgers append
records, while the sources map uses a separate direct write. The key store does
use a mode-0600 temporary file plus rename, but that does not make the other
stores or a whole-directory backup atomic. A consistent backup/restore plan
needs an agreed quiesce/snapshot procedure and validation across files; file-level
atomic writes are a separate reliability improvement, not a substitute for that
procedure. [Chats](../src/store/chats.ts#L57),
[jobs](../src/store/jobs.ts#L44), [job update](../src/store/jobs.ts#L65),
[settings](../src/store/settings.ts#L52), [auth](../src/store/auth.ts#L35),
[graph append](../src/store/graph.ts#L54),
[sources map](../src/store/graph.ts#L306).

The running-turn registry lives in process-global maps; stream reattachment and
abort resolve against those maps. Agent turns are designed to run independently
of a client's response-stream connection. The initial deployment therefore needs
one backend process, not several workers sharing the same filesystem; persisted
records do not make the live registries shared across processes.
[Registry](../src/server/turn-runs.ts#L1),
[turn lifecycle](../src/server/chat-handler.ts#L503).

The Linux fallback renderer starts a separate Chromium browser per job with
`--no-sandbox` and no explicit environment restriction, then loads generated HTML
from a temporary `file://` URL. That is distinct from the opaque-origin iframe
used to display the result in the client. Its credential/process/network boundary
needs an explicit server-side design. [Fallback](../src/agent/subagents/headless.ts#L258),
[temporary HTML execution](../src/agent/subagents/headless.ts#L283).

The parent investigation ran a harmless local runtime probe through `getHeadless`
with the host Chromium selected through `CHROME_PATH`: a demo button JavaScript
probe returned `yes` with no console, page or network errors, and SVG rendering
returned a 122-byte PNG. This involved no AI-provider call. It proves those basic
rendering paths work on the current host environment, not that the future Nix
package/service sandbox is complete or that generated demos are safe or compatible
with every client.

The parent also ran the existing standalone payload checks:
`node scripts/smoke-provider-runtime.mjs` passed with Google/Copilot/xAI native
adapters initialized, 1,163 confined modules and zero network attempts;
`node scripts/smoke-demo-runtime.mjs --standalone .next/standalone` passed with
160 confined Puppeteer modules. These validate the current standalone payload's
module closure, not a Nix closure, actual provider authentication, or service-mode
browser execution. [Provider smoke](../scripts/smoke-provider-runtime.mjs),
[demo smoke](../scripts/smoke-demo-runtime.mjs).

The existing packaging script already removes bundled Electron from the server
payload, while Next tracing explicitly includes dynamic provider/native runtime
dependencies. A headless Nix backend can build on that arrangement and select
Chromium through `CHROME_PATH`; this still needs a real package-build/runtime gate.
The root layout uses `next/font/google`, so a reproducible sandboxed build also
needs an explicit font asset strategy.
[Server packaging](../scripts/build-server.mjs#L70),
[trace configuration](../next.config.ts#L45),
[fonts](../app/layout.tsx#L2).

No new tests were executed by this client investigation. The initial whole-suite
pass reported earlier in the session is useful baseline evidence, but not a
substitute for these cross-device/runtime checks. The unresolved UX, update,
sign-in and draft decisions should be put to the owner before implementation.
