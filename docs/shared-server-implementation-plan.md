# Shared Linux backend: proposed delivery plan

Research baseline: upstream commit `3dd52110bbcbcba81645453ce0a8fdc230594c47`, inspected 2026-10-28. Parent tracker: [#1](https://github.com/francisqureshi/learnharness/issues/1). Detailed source evidence: [client and server research](shared-server-client-research.md).

The owner has approved the architecture and Linux-first order. The concrete slices below are proposals for review, not completed work or approval of the remaining product choices. No application code, live Nix configuration, credentials, or existing desktop records were changed during this research.

## Intended result

One backend on hws owns saved lessons, the knowledge graph, provider credentials, teaching turns, background jobs, and demo generation/verification. The existing Electron Mac interface and the iPhone preview connect to that backend while online. Delivered interactive demos run in each client's sandboxed frame. Dictation audio travels directly from the client to Deepgram using a temporary token minted by the backend; submitted transcript text becomes lesson input.

The Mac remains the primary client. The phone prioritises continuing learning; mobile visual-graph polish is optional. Preserve the underlying graph and existing Mac graph interface. Offline two-way data synchronisation is outside this plan. Whether unsent drafts must follow the learner between devices is a separate open decision.

Sharing a saved demo means reopening the generated HTML artifact. Internal slider, animation, and input state is not persisted by the current demo bridge; resuming those exact controls is also a separate product decision.

## What the deeper investigation changes

1. **Keep one backend process.** Turn ownership, event delivery, and provider refresh coordination are process-local. No clustered Node workers, overlapping deployments against one data directory, or two servers sharing a mounted data folder. Existing record formats and storage ports can stay for the first release. See [turn registry](../src/server/turn-liveness.ts), [running handles](../src/server/turn-runs.ts), and [credential owner](../src/server/web-subscriptions.ts).
2. **Make durability an explicit slice.** Chats, jobs, settings, and some graph metadata use direct writes. A process crash can leave an incomplete JSON document; this is an identified risk, not an observed loss. Reuse the existing atomic key-file pattern where appropriate, test failures, and establish consistent backups. Atomic replacement alone is not a multi-file transaction or proof of power-loss durability. See [chats](../src/store/chats.ts), [jobs](../src/store/jobs.ts), [settings](../src/store/settings.ts), [graph](../src/store/graph.ts), and [auth](../src/store/auth.ts).
3. **Treat rendering as an operational gate.** Linux Chromium fallback exists, but currently launches with `--no-sandbox` and inherited process environment. The service's model keys are reflected into that environment. Review child environment and browser isolation before treating a generated-demo runner as a durable credential-holding service. Client iframe sandboxing does not isolate server-side browser verification. See [headless runtime](../src/agent/subagents/headless.ts).
4. **Verify reconnect behaviour rather than assume it.** The engine keeps running across client disconnects, but source inspection suggests a no-job turn completed during an SSE gap may not refresh the current chat on reconnect. Reproduce this before changing code. Unsubmitted composer/answer drafts are local UI state. See the research note for exact client paths.
5. **Remote Mac mode involves more than a URL.** The development mode already loads a remote page and uses web subscription transport. Packaged mode also has local credentials, updater ownership, microphone permissions, origin-pinned IPC, and a bundled server. Preserve those boundaries while adding the agreed connection mode.
6. **Provider choice changes sign-in scope.** API keys fit the backend today. ChatGPT OAuth expects a loopback callback on the backend machine. Device-code providers have a different flow. Do not promise remote subscription setup merely because the web page loads.
7. **Phone layout needs work.** The sidebar's narrow-window auto-collapse is Electron-specific. Start by testing the existing learning flow at iPhone widths, then agree the required layout changes.

## Delivery slices and gates

### A. Package the backend in Nix — first implementation target (#2)

Proposed files: a small flake entry, `nix/package.nix`, and a package-specific smoke harness. The final names/options should be reviewed with the module interface.

- Pin a source revision, nixpkgs, Node, and the npm lockfile dependency hash. The local preview ran on Node 24; upstream CI uses Node 26. Choose and validate the package's runtime explicitly rather than inherit whichever Node is on PATH.
- Start from the existing Next standalone output and payload curation. Include static assets, prompts, native modules and their libraries, provider catalog data, PDF fonts, and dynamic import closures.
- Exclude learning records, credentials, private mobile configuration, prior installers, and the development checkout from the package input/output.
- Resolve `next/font/google` build-time network access with pinned font assets or equivalent fixed inputs while retaining the existing typography. The fonts are currently downloaded at build time, not by the browser.
- Avoid a build-time Electron download for a server-only package; preserve the supported Chromium fallback through an explicit `CHROME_PATH`.
- Account for runtime caches, temporary files, and font discovery separately from the immutable package. Test for writes attempted inside the Nix store.

**Gate:** the Nix build succeeds in its normal sandbox. Start the installed package from outside the checkout with isolated writable directories; load the UI/API, exercise provider imports offline, render a PDF and SVG, and execute a benign interactive demo. Existing desktop Electron smoke checks are useful but insufficient for this plain-Node service.

Evidence: [Next configuration](../next.config.ts), [payload curation](../scripts/build-server.mjs), [provider smoke](../scripts/smoke-provider-runtime.mjs), [demo smoke](../scripts/smoke-demo-runtime.mjs), [layout fonts](../app/layout.tsx), [Nix npm packaging reference](https://github.com/NixOS/nixpkgs/blob/master/doc/languages-frameworks/javascript.section.md), and the installed Next font documentation (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`).

### B. Define and validate the persistent service (#2)

Proposed reusable module: `nix/module.nix`, imported by the existing host configuration. Review package selection, listen port, service identity, state layout, and proxy ownership before applying it.

- Use a dedicated service identity with a writable state directory, owner-only credentials, deliberate cache/temp access, and automatic startup/restart.
- Keep `LH_DATA_DIR` and `LH_AUTH_FILE` explicit and outside both the checkout and Nix store. Saved key changes already work without a server restart; account for real environment keys overriding file values.
- Run a single process, bound to loopback, behind the existing private HTTPS route. Preserve unrelated Tailscale routes and verify the intended devices' access rules.
- Keep long-lived SSE responses streaming through the proxy and test reconnects; successful page loading is not sufficient.
- Validate Chromium under the actual service restrictions. Remove unnecessary inherited secrets from child processes and establish the browser isolation/network boundary. Do not blindly transplant desktop browser assumptions into the service.
- Document process restart and crash behaviour. No application-level graceful-turn drain was found in the inspected app/server source; a longer systemd timeout alone does not implement one. Plan updates when idle or explicitly handle interrupted work.

**Gate:** service runs without a desktop login, restarts on failure, uses the package independently of the repo, and reaches only the intended storage. Exercise read/write through the API against scratch state. Schedule the full-host reboot check with the owner; do not reboot hws during research or unscheduled rollout.

### C. Make saved progress recoverable (#3, with durability work before migration)

- Agree fresh history versus migration. If migrating, inventory the installed Mac version and record formats first; copy a consistent snapshot and leave the original untouched.
- Propose atomic replacement for vulnerable JSON stores with meaningful failure tests. Check the append-only ledger recovery behaviour separately; do not imply atomic JSON writes solve partially appended ledger lines or multi-file consistency.
- Define a consistent backup procedure: quiesce writers or use a proven snapshot mechanism. Decide destination, retention, and how credentials are recovered.
- Restore into a separate state directory and validate a lesson, pending question, graph, settings, and saved demo.
- Pair software rollback with data compatibility checks and a pre-update backup. Chat and graph schema guards can reject records from newer versions; a Nix generation rollback does not roll back mutable data.

**Gate:** failed-write tests preserve the last good record where promised, corrupt records have visible recoverable handling, and an isolated restore passes a real lesson-resumption check. Migration and destructive replacement require the agreed data choice.

### D. Prove cross-client learning continuity (#4)

Use deterministic engines and two web clients first, before native-device availability becomes a blocker. Extend the existing flow tests rather than recreate their coverage.

| Scenario | Required observation |
| --- | --- |
| A submits; B opens mid-turn | B attaches to the same turn; no second generation |
| A disconnects during generation | Server continues; reopening shows the saved result |
| B misses start and settle events for a turn with no jobs | Reconnect fetches current record and liveness without requiring navigation |
| A and B answer the same pending question | One accepted answer; the other client refreshes without duplicate progress |
| Restart during a response/job | Saved input survives; incomplete work has a clear recoverable state |
| Demo finishes while client is away | Saved demo is delivered once and can be reopened |
| Mac → iPhone → Mac | Same submitted progress and artifacts on every client |
| Unsubmitted text exists | Behaviour matches the owner's explicit draft-handoff decision |

**Gate:** reproduce suspected gaps, fix only confirmed gaps, then run this matrix against the private proxy and later the actual Mac and iPhone clients. An interrupted turn need not resume its exact token stream after a process crash; define recovery in terms of saved input/output and an honest retry path.

### E. Adapt the existing Mac app (#7, after backend gates)

- Use the development remote-URL path only as a spike. Define a supported server connection configuration and clear unavailable-server behaviour.
- In shared mode, do not start a local server or use local credentials for central lessons. Review preload/IPC transport selection, external sign-in navigation, and exact trusted origins.
- Preserve local rendering, microphone capture, native window behaviour, and the graph UI.
- Separate fork identity/update delivery from upstream: the current publisher config points to upstream, so an automatic update could remove fork-specific behaviour. Agree disabling updates for the preview versus a fork release channel.
- Decide how the fork coexists with the original app and protects the original user-data directory. Do not replace the signed upstream installation during the spike.
- Verify the chosen provider's actual authentication and refresh flow. For ChatGPT, choose server-local initial login or an explicitly designed remote callback approach before claiming support.

**Gate:** packaged fork connects to hws, never launches a competing local backend in shared mode, and completes a lesson/demo/dictation round trip. Verify it cannot install an incompatible upstream update. Mac signing/distribution is its own check, distinct from iPhone free provisioning.

### F. Validate the personal iPhone preview (#5 and #6)

- Review the existing uncommitted `mobile/` prototype before promoting it to maintained code.
- Complete Xcode and Personal Team setup, then build and install on a real device.
- Use a private HTTPS origin and test microphone permission, dictation, external sign-in, errors, lock/unlock, and network changes.
- Agree responsive changes from observed failures: sidebar/navigation, pending-question dock, composer/keyboard, safe areas, touch targets, and demo viewport.
- Verify saved lessons and demos first; do not expand the milestone into a mobile graph redesign.

**Gate:** complete a lesson, leave, resume, and use a saved demo on the phone. Current remote-URL Capacitor configuration is a personal preview, not an established App Store distribution architecture. No claim of native-build or real-device success yet.

## Validation performed during this research

No paid model calls, credential changes, data migration, or server restarts were performed.

- Existing standalone provider smoke passed: 1,163 modules resolved inside the payload, native provider adapters initialised, zero network attempts. This validates imports, not live authentication or model generation.
- Standalone demo dependency smoke passed: 160 Puppeteer modules resolved inside the payload.
- The source backend's real `getHeadless().runDemo` executed a small button/JavaScript demo on hws with an explicit Chromium path: zero console/page/network errors and probe result `yes`. Its SVG renderer returned a PNG. This was under the current user environment, not the proposed service sandbox or Nix package.
- A deliberately invalid subscription-control request through the private HTTPS proxy returned `400 Unsupported connection`, rather than an origin-gate `403`. This confirms the gate accepted that correctly addressed request without performing a provider action; full browser sign-in remains untested.
- Earlier baseline build, lint, typecheck and 2,517 tests passed. They are not substitutes for Nix, multi-client browser, packaged Mac, or actual iPhone checks.

## Decisions to resolve before dependent work

1. Which provider connection must work first? An asynchronous question has been sent to the owner. Record the answer in the tracker; no answer means still open.
2. Fresh state or migration from the Mac? This governs cutover and data tests.
3. Backup destination/retention and acceptable brief downtime for a consistent snapshot.
4. Should unsubmitted answer/composer drafts follow the learner to another device?
5. Preview Mac identity/update policy and supported remote connection UX.

Independent packaging research can proceed while these are open; migration, provider-specific sign-in changes, and product behaviour must wait for the relevant decision. The next reviewable deliverable should be the Nix package/module proposal and its scratch-state validation, before any production cutover.
