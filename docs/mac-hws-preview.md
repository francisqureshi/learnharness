# LearnHarness hws Mac preview

The personal Apple Silicon preview uses the existing Electron shell, with its
native window, menus, keyboard shortcuts, graph and local demo rendering. Its
fixed server is `https://hws.tail0d91b.ts.net:10443`; Tailscale must be connected.

## Installation and separation

Build on macOS with Node/npm installed:

```sh
node scripts/build-hws-mac.mjs "$HOME/Projects/learnharness-hws-preview/dist"
```

The script builds the shell in an isolated temporary directory and signs it
locally (ad hoc). It does not need an Apple developer account or use upstream
signing/notarization credentials. This is a personal preview, not a notarized
release for distribution. Copy `dist/mac-arm64/LearnHarness hws.app` to
`~/Applications` and open it.

The bundle ID is `net.francisqureshi.learnharness.hws`. Its profile is
`~/Library/Application Support/LearnHarness hws`. The original LearnHarness app
and profile are separate. The preview starts no local backend, reads no local
provider credentials, and never checks, downloads or installs upstream updates.
Preview shell updates are manual rebuilds. UI/backend updates come from hws.

A failed initial connection offers Retry or Quit. Provider connections and
submitted lessons belong to hws. Existing ChatGPT sign-in is reused; new sign-in
still uses the SSH callback tunnel described in `nix-server.md`.

## Attachments

The paperclip and file drop zone upload individual files, up to 50 MiB each, over
the private HTTPS connection. Folder upload is unavailable. A successful upload
adds a reference to the private server copy to the current input; it never sends
a lesson turn automatically. Failed files show an error without discarding other
successful uploads. Mac filesystem paths are not exposed by the remote preload.

Copies live below `$LH_DATA_DIR/uploads`, with private directories and mode-0600
files. Unique directories prevent equal filenames overwriting each other. The
server bounds streamed bytes, rejects invalid filenames and cross-origin writes,
and removes failed partial transfers. An upload is published only after its file
has been closed and atomically renamed. File types retain the tutor's existing
read-tool support and file-access restrictions; upload does not make every format
readable by the model.

Copies are retained even if removed from an unsent draft. Original-file edits do
not sync automatically. The existing backup includes these copies and defers
while uploads are active. There is no automatic upload pruning in this preview.
The upload endpoint requires `LH_SHARED_SERVER=1`, set by the NixOS module.

## Validation and remaining gates

- Tests cover upload size, path validation, interrupted-transfer cleanup,
  duplicate names, private modes, picker/drop behavior and remote preload.
- Reconnect now refreshes a missed saved turn even if no background job changed;
  an already-running server turn is attached without replacing an active local
  stream. The gap was reproduced in the packaged Mac client before the fix.
- NixOS VM checks exercise upload persistence through backup/restore, backup
  deferral during active uploads, service isolation and reboot.
- The packaged preview was opened on macmini-uptown under mac10 and verified
  against hws for shared lessons, existing ChatGPT status, disabled updater and
  the interactive slope demo. Upload UI and the reconnect fix require activating
  the updated server; do not count the source tests as this final live gate.
- Real microphone transcription requires separate Deepgram configuration and
  macOS consent. Physical sleep/wake still needs a user-device check. Unsent
  drafts are not a cross-device synchronization feature.

## Updating the permanent backend

After building/reviewing the target NixOS generation, run on hws:

```sh
sudo bash /home/fq/Projects/learnharness-nix/scripts/update-hws.sh /path/to/built-system
```

The helper refuses busy lessons/jobs/uploads, takes a private pre-update snapshot,
updates the generation and verifies lessons/settings/ChatGPT and upload capability.
It rolls back the service version on failure without replacing current state or
rewinding rotated credentials. Only the already-observed wg0 activation failure
is tolerated; new failures still trigger rollback. Pre-update snapshots are kept
separately from the daily 14-day rotation.
