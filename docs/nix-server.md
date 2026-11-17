# Nix server package

Implementation for [#2](https://github.com/francisqureshi/learnharness/issues/2): a standalone backend package, NixOS service, isolated offline demo verifier and SSH-compatible ChatGPT callback. Upstream v0.5.0 (`713377f`) was merged on 2026-11-08. No existing learning data has been migrated.

## Build and validate

On x86_64 Linux with Nix flakes enabled:

```sh
nix build
nix flake check
./result/bin/learnharness-server-check
```

The flake pins nixpkgs; the package uses its Node 24, the npm lockfile and a fixed dependency hash. The source allowlist excludes local data, credentials and the mobile prototype. Fonts come from pinned Nix packages, so Next compilation needs no Google font download. Native libraries receive Nix runtime paths. Chromium is supplied explicitly; Electron is removed from the standalone payload.

The installed check uses temporary state and no provider credentials. It verifies confined provider/Puppeteer imports, native SVG/canvas/PDF rendering, the application's actual demo execution, UI/API startup and the subscription origin gate. Its demo tests assert that a working interaction succeeds while host-loopback HTTP and an unrelated host file are inaccessible. It cleans up its server, browser and temporary state. Run it on a host that permits user namespaces. It is a separate runtime check, not run inside the Nix build sandbox.

`nix flake check` also boots a disposable NixOS VM. It runs the installed checks under the real system service restrictions, tests filesystem permissions, the fixed loopback OAuth listener, crash recovery and saved settings across reboot. The Next build performs TypeScript validation. No live AI generation or subscription authentication is exercised by these tests.

## Offline demo boundary

The Nix package sets `LH_DEMO_BROWSER` to its Bubblewrap launcher. The application uses this path before considering a desktop helper; failure never falls back to an unrestricted browser. Each render gets its own network, process and mount namespaces, a cleared environment, private temporary storage and browser profile. Only the Nix store and the render's input directory are mounted read-only. Chromium keeps its own sandbox enabled. Puppeteer communicates over inherited pipes, so no debugging TCP listener needs to cross the network boundary.

Demo instructions now require inline dependencies and assets. External/CDN resources fail offline verification. The standalone desktop helper is otherwise unchanged; shared Mac clients use the server verifier. This is process isolation, not a guarantee against every kernel/browser vulnerability or a per-job CPU/memory quota.

## ChatGPT sign-in from a Mac

The service uses a fixed loopback callback on port 1455 (`services.learnharness.chatgptCallbackPort`). The normal desktop flow retains its ephemeral port. If the configured port is occupied, login fails rather than silently changing ports.

On the Mac whose browser will complete sign-in, keep this SSH session open:

```sh
ssh -T -o RemoteCommand=none -o ExitOnForwardFailure=yes -N \
  -L 127.0.0.1:1455:127.0.0.1:1455 fq@hws
```

Open the private LearnHarness URL, use its ChatGPT connection control, and complete sign-in in that Mac's browser. Both ends must use the configured port. The callback crosses SSH to the server; token exchange, refresh and storage remain on hws. Close the tunnel after LearnHarness confirms connection. Do not paste callback URLs or credential files into chat. Port 1455 is not exposed through the firewall or Tailscale Serve.

The callback still checks its exact host/path, state and PKCE flow. Tests cover invalid ports, port conflicts, unchanged redirect URI during token exchange and owner-only credential storage. A Mac-to-hws SSH loopback probe passed without credentials. On 2026-11-08 the owner completed live sign-in through the SSH tunnel. Foreground lesson responses and background demo generation through the saved subscription succeeded. Token refresh across expiry remains a separate acceptance step. OpenAI documents the same [SSH callback-forwarding pattern for Codex](https://learn.chatgpt.com/docs/auth#fallback-forward-the-localhost-callback-over-ssh); LearnHarness uses its own existing OAuth implementation rather than importing Codex credentials.

## Proposed host integration

Pin this fork at a reviewed commit in the host flake and import `learnharness.nixosModules.default`. Example module settings:

```nix
{
  services.learnharness = {
    enable = true;
    package = learnharness.packages.x86_64-linux.default;
    port = 3100;
    chatgptCallbackPort = 1455;
    backup.enable = true;
  };
}
```

The system service runs as `learnharness`, binds to `127.0.0.1`, starts at boot and restarts on failure. It uses `/var/lib/learnharness/data`, `/var/lib/learnharness/auth.json` and `/var/cache/learnharness`, with owner-only state/cache permissions and a restrictive umask. It opens no firewall ports and does not modify Tailscale routes. Logs will be available with `journalctl -u learnharness` after host integration.

Keep exactly one backend process per data directory. Before applying this module, stop the transient preview deliberately, agree fresh state versus migration, and preserve the existing private HTTPS route and rollback path. Never put credentials in a Nix expression or store path. Host integration and cutover are not performed by `nix build` or `nix flake check`.

## Local backups and hws cutover

The owner selected daily local backups at 04:00 (host local time), retaining completed snapshots for 14 days. With `backup.enable`, the timer snapshots `/var/lib/learnharness` into `/var/lib/learnharness-backups`. Archives include credentials and are root-readable only (directory 0700, archive 0600). The backup checks all session turns, compaction and background jobs before stopping the service, writes and verifies an archive, then restarts the service even if archiving fails. Active work or a failed liveness check defers the attempt for an hour. Only completed snapshots older than the retention window are pruned, after a new snapshot succeeds. The idle check is not an atomic admission lock: avoid starting new work during the brief maintenance window.

The VM test exercises snapshot/restore, permissions, active-job deferral without restarting the app, retention, crash recovery and reboot. Local snapshots do not protect against loss of the host disk.

For this first hws cutover, build the reviewed host configuration, then run:

```sh
sudo bash /home/fq/Projects/learnharness-nix/scripts/deploy-hws.sh \
  /home/fq/.cache/learnharness-hws-system
```

The helper refuses active work or existing permanent state. It stops the validation user service, saves a private pre-cutover snapshot, copies its lessons/settings/credentials into system-service state, activates the built NixOS generation and checks saved session IDs, settings and the ChatGPT connection. On failure it attempts to restore the previous generation and validation service, carrying back any changed state to preserve token rotation. The original pre-cutover snapshot is retained separately from daily snapshot pruning. Do not submit new work during cutover. This command needs a human sudo authentication on hws; no password belongs in chat.

The validation service must have a persistent user-unit file (disabled at boot) so NixOS user-manager reloads cannot discard the rollback target. Recovery attempts the validation restart even when restoring the previous NixOS generation reports an unrelated unit error. A retry after rollback uses `--retry-after-rollback`: it archives leftover permanent state before copying the currently running validation state. It never overwrites that leftover state in place.

On hws, `wg-quick-wg0.service` conflicts with an existing `wfh` route. The helper tolerates NixOS exit status 4 only if wg0 was already the sole failed unit, remains the sole failed unit, and the target generation actually became current. All LearnHarness health/data checks still run; any new unit failure or other activation error triggers rollback. No VPN routes are modified.

## Remaining release gates

- Apply the reviewed host integration and verify its private HTTPS route. VM coverage does not replace a deployment check on hws.
- Verify token refresh across expiry and connection recovery after the production cutover. Live sign-in, lesson turns and a generated/demo-delivery cycle have passed.
- Verify the first scheduled backup on hws after cutover. Mac history migration remains separate from transferring the current validation instance.
- Validate the Mac remote Electron client and subsequent iPhone client; no native client behaviour changes in this slice.

For updates, change the host's pinned fork revision, build and run these checks before switching. Nix can retain previous packages, but package rollback does not restore mutable learning data or reverse a data migration.

## Live lesson and demo acceptance — 2026-11-08

The owner started a PostgreSQL lesson through the private Mac browser. A separate synthetic “Server demo validation” session completed assessment and planning, dispatched a slope-slider demo, and delivered the finished artifact. The job reported `tested: true`; independent browser checks verified negative/zero/positive presets, keyboard slider operation, no page errors, and no horizontal overflow at 390px width. The demo ran using the isolated launcher. This proves a live foreground/background subscription path, not every model capability or native Mac/iPhone integration.
