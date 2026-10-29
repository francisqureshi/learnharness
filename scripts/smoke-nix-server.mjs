/** Exercise an installed Nix package with fresh state and no provider credentials. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { verifyProviderRuntime } from "./smoke-provider-runtime.mjs";
import { verifyDemoRuntime } from "./smoke-demo-runtime.mjs";

const pkg = process.argv[2];
assert.ok(pkg, "usage: smoke-nix-server.mjs /nix/store/...-learnharness-server");
const payload = path.join(pkg, "lib/learnharness");
const require = createRequire(path.join(payload, "server.js"));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-nix-check-"));
let child;
let browser;
let log = "";

try {
  verifyProviderRuntime(payload);
  verifyDemoRuntime(payload);

  const { Resvg } = require("@resvg/resvg-js");
  const svg = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>');
  assert.equal(svg.render().asPng().subarray(1, 4).toString(), "PNG");
  const { createCanvas } = require("@napi-rs/canvas");
  const canvas = createCanvas(40, 40);
  assert.equal(canvas.toBuffer("image/png").subarray(1, 4).toString(), "PNG");
  const pdfjs = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
  const pdf = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(path.join(pkg, "share/learnharness/sample-3page.pdf"))),
    standardFontDataUrl: path.join(payload, "node_modules/pdfjs-dist/standard_fonts") + "/",
    verbosity: 0,
  });
  try {
    const document = await pdf.promise;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const surface = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: surface.getContext("2d"), viewport }).promise;
    assert.ok(surface.toBuffer("image/png").length > 100);
  } finally { await pdf.destroy(); }
  console.log("[nix-check] native SVG, canvas and PDF rendering passed");

  // The command wrapper supplies the Nix Chromium path. No generated content,
  // provider traffic or private service data participates in this smoke test.
  const puppeteer = require("puppeteer-core");
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    userDataDir: path.join(scratch, "browser"),
    args: ["--disable-dev-shm-usage"],
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      ["PATH", "HOME", "TMPDIR", "XDG_RUNTIME_DIR", "FONTCONFIG_FILE", "FONTCONFIG_PATH"].includes(key))),
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", request => { void request.abort(); });
  await page.setContent('<button onclick="this.textContent=\'done\'">start</button>');
  await page.click("button");
  assert.equal(await page.$eval("button", el => el.textContent), "done");
  await browser.close();
  browser = undefined;
  console.log("[nix-check] sandboxed Chromium interaction passed");

  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  const auth = path.join(scratch, "auth.json");
  fs.writeFileSync(auth, "{}\n", { mode: 0o600 });
  child = spawn(path.join(pkg, "bin/learnharness-server"), [], {
    cwd: scratch,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      LH_DATA_DIR: path.join(scratch, "data"),
      LH_AUTH_FILE: auth,
      LH_IGNORE_ENV_KEYS: "1",
      XDG_CACHE_HOME: path.join(scratch, "cache"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const keep = chunk => { log = (log + chunk.toString()).slice(-12000); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  let spawnError;
  child.on("error", error => { spawnError = error; });
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    assert.equal(child.exitCode, null, `server exited before ready: ${log}`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      if (response.ok) { ready = true; break; }
    } catch { /* startup race */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, `server did not become ready: ${log}`);
  for (const route of ["/api/graph", "/api/models", "/api/settings", "/api/chats"]) {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, `${route}: ${await response.text()}\n${log}`);
  }
  const response = await fetch(origin + "/api/subscriptions", {
    method: "POST",
    headers: { origin, "x-learnharness-subscriptions": "1", "content-type": "application/json" },
    body: JSON.stringify({ providerId: "__invalid_probe__", op: "__invalid__" }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Unsupported connection.");
  assert.equal(fs.readFileSync(auth, "utf8"), "{}\n");
  console.log("[nix-check] installed server HTTP/API and subscription origin gate passed");
} finally {
  await browser?.close();
  if (child?.pid && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}
