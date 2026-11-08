/** Build only the existing Electron shell; the Next backend stays on hws.
 * Run on the Mac: node scripts/build-hws-mac.mjs /absolute/output/directory
 * Uses an isolated build workspace, never the upstream desktop build/signing flow. */
import { mkdtemp, readFile, writeFile, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Build this preview on an Apple Silicon Mac.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("Supply an absolute output directory.");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const stage = await mkdtemp(path.join(tmpdir(), "learnharness-hws-build-"));
await cp(path.join(root, "electron"), path.join(stage, "electron"), { recursive: true });
await mkdir(path.join(stage, "build"));
await cp(path.join(root, "build/icon.icns"), path.join(stage, "build/icon.icns"));
await cp(path.join(root, "build/entitlements.mac.plist"), path.join(stage, "build/entitlements.mac.plist"));
await writeFile(path.join(stage, "package.json"), JSON.stringify({
	name: "learnharness-hws", productName: "LearnHarness hws", version: pkg.version,
	description: "Personal LearnHarness client for hws", author: pkg.author,
	license: pkg.license, main: "electron/main.cjs", lhRemoteOrigin: "https://hws.tail0d91b.ts.net:10443",
}, null, 2));
await writeFile(path.join(stage, "electron-builder.json"), JSON.stringify({
	appId: "net.francisqureshi.learnharness.hws", productName: "LearnHarness hws",
	electronVersion: pkg.devDependencies.electron.replace(/^\^/, ""),
	directories: { output }, files: ["!**/*", "electron/**/*", "package.json"],
	publish: null, npmRebuild: false,
	mac: { target: "dir", icon: "build/icon.icns", identity: "-", hardenedRuntime: false, notarize: false,
		entitlements: "build/entitlements.mac.plist",
		extendInfo: { NSMicrophoneUsageDescription: "LearnHarness uses the microphone for dictation into your lessons." } },
}, null, 2));
execFileSync("npm", ["install", "--no-package-lock", "--ignore-scripts", "--no-audit", "--no-fund", "--save-dev", `electron-builder@${pkg.devDependencies["electron-builder"]}`], { cwd: stage, stdio: "inherit" });
execFileSync(path.join(stage, "node_modules/.bin/electron-builder"), ["--config", "electron-builder.json", "--mac", "--arm64", "--dir"], { cwd: stage, stdio: "inherit", env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" } });
console.log(`Preview built in ${output}. Build workspace: ${stage}`);
