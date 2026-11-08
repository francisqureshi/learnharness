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

The callback still checks its exact host/path, state and PKCE flow. Tests cover invalid ports, port conflicts, unchanged redirect URI during token exchange and owner-only credential storage. A Mac-to-hws SSH loopback probe passed without credentials. Live sign-in, account entitlement, refresh and generation require the owner's browser authentication and remain separate acceptance steps. OpenAI documents the same [SSH callback-forwarding pattern for Codex](https://learn.chatgpt.com/docs/auth#fallback-forward-the-localhost-callback-over-ssh); LearnHarness uses its own existing OAuth implementation rather than importing Codex credentials.

## Proposed host integration

Pin this fork at a reviewed commit in the host flake and import `learnharness.nixosModules.default`. Example module settings:

```nix
{
  services.learnharness = {
    enable = true;
    package = learnharness.packages.x86_64-linux.default;
    port = 3100;
    chatgptCallbackPort = 1455;
  };
}
```

The system service runs as `learnharness`, binds to `127.0.0.1`, starts at boot and restarts on failure. It uses `/var/lib/learnharness/data`, `/var/lib/learnharness/auth.json` and `/var/cache/learnharness`, with owner-only state/cache permissions and a restrictive umask. It opens no firewall ports and does not modify Tailscale routes. Logs will be available with `journalctl -u learnharness` after host integration.

Keep exactly one backend process per data directory. Before applying this module, stop the transient preview deliberately, agree fresh state versus migration, and preserve the existing private HTTPS route and rollback path. Never put credentials in a Nix expression or store path. Host integration and cutover are not performed by `nix build` or `nix flake check`.

## Remaining release gates

- Apply the reviewed host integration and verify its private HTTPS route. VM coverage does not replace a deployment check on hws.
- Complete the chosen ChatGPT login flow, refresh, teaching and generated-demo tests. Offline provider imports do not establish subscription access.
- Establish persistence/backup/restore and update/rollback procedures before relying on real learning data.
- Validate the Mac remote Electron client and subsequent iPhone client; no native client behaviour changes in this slice.

For updates, change the host's pinned fork revision, build and run these checks before switching. Nix can retain previous packages, but package rollback does not restore mutable learning data or reverse a data migration.
