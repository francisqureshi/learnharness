# LearnHarness iPhone preview

A Capacitor iOS wrapper for a private LearnHarness web server. Next.js, agents,
credentials, and learning data stay on the server. The phone loads the existing
web interface over HTTPS. This is a personal-device prototype: Capacitor's remote
server URL is a development facility, not a finished App Store deployment.

## Prepare the project

Use Node 22+ and, for building, a Mac with Xcode 26+ installed and opened once.
From this directory:

```sh
npm ci
LH_SERVER_URL=https://your-server.example npm run configure
npm run ios:add  # first time only; skip if ios/ already exists
npm run ios:sync
npm run ios:open
```

The generated configuration stays untracked so a private server address does not
become a shared default. Reconfigure and sync whenever the server address changes.
Use an HTTPS origin with a valid certificate. Do not expose LearnHarness directly
to the public internet: its web mode shares data and credentials without a login.
Tailscale Serve can proxy a loopback-only Next server privately; the iPhone must
also have Tailscale connected to the same tailnet with access to the server port.

## Install on your iPhone

1. In Xcode Settings → Accounts, sign in with your Apple Account.
2. Select the App target → Signing & Capabilities, enable automatic signing, and
   select your Personal Team. Change the bundle identifier if Xcode needs a unique one.
3. Connect and unlock the iPhone, accept its trust prompts, and enable Developer
   Mode if requested by Xcode.
4. Select the iPhone as the run destination and press Run.

Free Personal Team provisioning expires after seven days; rebuild and reinstall
from Xcode to renew it. No paid membership is needed for this personal test.

## Preview limits

- Requires the server and a network connection; no offline lessons.
- Phone navigation uses a drawer that starts closed; the web UI owns safe-area
  padding and inputs wait for an explicit tap. UIKit content insets are disabled
  to avoid applying the safe area twice. Mac layout behavior is unchanged.
- Test microphone permission, dictation, keyboard layout, external sign-in,
  file uploads, and reconnection after locking the phone on a real device.
- No native plugins are installed. External destinations are not broadly allowlisted.
- Provider credentials must be configured on the server before starting lessons.
- The static connection-error page is bundled locally and offers recovery steps.

The upstream desktop installation has separate storage. This preview does not
copy or modify that installation's learning records or credentials.

## Repeatable layout check

From the repository root, run `node scripts/smoke-phone-layout.mjs URL` against
an isolated built server. Set `CHROME_PATH` if Chromium is elsewhere. The check
covers drawer overlay/dismissal, navigation, input focus, reload, landscape, and
unchanged desktop/Electron layouts without submitting chats or calling a model.
Actual keyboard, dictation, and device reconnect still require iPhone acceptance.

For command-line device builds, use the connected phone's UDID as the Xcode
destination with `-allowProvisioningUpdates -allowProvisioningDeviceRegistration`,
rather than a generic iOS destination. This lets automatic signing include the
phone in the Personal Team profile. Keep team identifiers and generated signing
profiles out of the repository. If signing fails in SSH with `errSecInternalComponent`,
run the build in the signed-in Mac user's local Terminal so Keychain can prompt.
After installation, iOS may also require trusting your Apple ID under Settings →
General → VPN & Device Management before the first launch.
