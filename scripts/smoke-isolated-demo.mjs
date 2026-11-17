import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Runs the application's real rendering entry point, without provider calls. */
export async function verifyIsolatedDemo(headless) {
  assert.ok(process.env.LH_DEMO_BROWSER, "isolated demo launcher must be configured");
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "lh-private-canary-"));
  let requests = 0;
  const server = http.createServer((_req, res) => { requests++; res.end("private"); });
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const good = await headless.runDemo('<button id="b" onclick="this.textContent=\'done\'">start</button>', {
      settleMs: 50, probe: "document.querySelector('#b').click(); document.querySelector('#b').textContent",
    });
    assert.equal(good.ok, true, JSON.stringify(good));
    assert.equal(good.probeResult, "done");
    const url = `http://127.0.0.1:${server.address().port}/private`;
    const network = await headless.runDemo(`<script src="${url}"></script>`, { settleMs: 50 });
    assert.equal(network.ok, false, "private HTTP must fail verification");
    assert.ok(network.failedRequests.some(request => request.includes(url)));
    assert.equal(requests, 0, "browser reached host loopback");
    const canary = path.join(scratch, "private.js");
    await fs.writeFile(canary, 'window.privateCanary = "leaked";');
    const file = await headless.runDemo(`<script src="${pathToFileURL(canary)}"></script>`, {
      settleMs: 50, probe: "typeof window.privateCanary",
    });
    assert.equal(file.probeResult, "undefined");
    assert.equal(file.ok, false, "host file must fail verification");
    console.log("[nix-check] application demo execution passed; host HTTP and files blocked");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(scratch, { recursive: true, force: true });
  }
}
