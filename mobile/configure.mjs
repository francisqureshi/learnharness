import { writeFileSync } from "node:fs";

// A remote webview is for the personal-device preview, not an App Store build.
const input = process.env.LH_SERVER_URL;
if (!input) throw new Error("Set LH_SERVER_URL to your private HTTPS LearnHarness server URL.");
const url = new URL(input);
if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
  throw new Error("LH_SERVER_URL must be an HTTPS origin without credentials, a path, query, or fragment.");
}

const config = {
  appId: "net.learnharness.personalpreview",
  appName: "LearnHarness",
  webDir: "www",
  server: {
    url: url.origin,
    cleartext: false,
    errorPath: "offline.html"
  },
  plugins: { Keyboard: { resize: "native", autoBackdropColor: "dom" } },
  ios: {
    // The web UI owns safe-area padding; avoid applying UIKit insets twice.
    contentInset: "never",
    preferredContentMode: "mobile"
  }
};
writeFileSync(new URL("capacitor.config.json", import.meta.url), JSON.stringify(config, null, 2) + "\n");
console.log(`Configured LearnHarness preview for ${url.origin}. Run npm run ios:sync after changing this URL.`);
