# Nix server package

This is the first implementation slice for [#2](https://github.com/francisqureshi/learnharness/issues/2). It packages the existing backend and provides a NixOS module. It has not replaced the running preview or migrated any learning data.

## Build and validate

On x86_64 Linux with Nix flakes enabled:

```sh
nix build
nix flake check
./result/bin/learnharness-server-check
```

The flake pins nixpkgs; the package uses its Node 24, the npm lockfile and a fixed dependency hash. The source allowlist excludes local data, credentials and the mobile prototype. Fonts come from pinned Nix packages, so Next compilation needs no Google font download. Native libraries receive Nix runtime paths. Chromium is supplied explicitly; Electron is removed from the standalone payload.

The installed check uses temporary state and no provider credentials. It verifies confined provider/Puppeteer imports, native SVG/canvas/PDF rendering, a sandbox-enabled Chromium interaction, UI/API startup and the subscription origin gate. It cleans up its server, browser and temporary state. Run it on a host that permits Chromium's user-namespace sandbox. It is a separate runtime check, not run inside the Nix build sandbox.

Validated on hws: sandboxed package build, `nix flake check`, and the installed check from `/tmp`. The Next build also performs TypeScript validation. No live AI generation or subscription authentication is exercised.

## Proposed host integration

Pin this fork at a reviewed commit in the host flake and import `learnharness.nixosModules.default`. Example module settings:

```nix
{
  services.learnharness = {
    enable = true;
    package = learnharness.packages.x86_64-linux.default;
    port = 3100;
  };
}
```

The system service runs as `learnharness`, binds to `127.0.0.1`, starts at boot and restarts on failure. It uses `/var/lib/learnharness/data`, `/var/lib/learnharness/auth.json` and `/var/cache/learnharness`, with owner-only state/cache permissions and a restrictive umask. It opens no firewall ports and does not modify Tailscale routes. Logs will be available with `journalctl -u learnharness` after host integration.

Keep exactly one backend process per data directory. Before applying this module, stop the transient preview deliberately, agree fresh state versus migration, and preserve the existing private HTTPS route and rollback path. Never put credentials in a Nix expression or store path. Host integration and cutover are not performed by `nix build` or `nix flake check`.

## Remaining release gates

- Validate actual service startup/restart, writable caches and rendering under its systemd restrictions. Module assertions are evaluation checks, not a running NixOS VM test.
- Isolate the backend's generated-demo browser. The current application fallback still uses `--no-sandbox` and inherits the server environment. The sandbox-enabled benign runtime probe does not change or validate that application boundary.
- Complete the chosen ChatGPT login flow, refresh, teaching and generated-demo tests. Offline provider imports do not establish subscription access.
- Establish persistence/backup/restore and update/rollback procedures before relying on real learning data.
- Validate the Mac remote Electron client and subsequent iPhone client; no native client behaviour changes in this slice.

For updates, change the host's pinned fork revision, build and run these checks before switching. Nix can retain previous packages, but package rollback does not restore mutable learning data or reverse a data migration.
