import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("rollback restarts validation even when the previous system activation fails", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-cutover-test-"));
  try {
    const script = fs.readFileSync(new URL("../scripts/deploy-hws.sh", import.meta.url), "utf8");
    const start = script.indexOf("rollback() {");
    const end = script.indexOf("trap rollback EXIT", start);
    assert(start >= 0 && end > start);
    fs.mkdirSync(path.join(directory, "bin"));
    fs.writeFileSync(path.join(directory, "bin/switch-to-configuration"), "#!/usr/bin/env bash\nexit 4\n", { mode: 0o755 });
    const run = spawnSync("bash", ["-c", `
      set -euo pipefail
      previous="$1"
      stopped=1; copied=0; switched=1
      systemctl() { :; }
      nix-env() { :; }
      user_service() { printf '%s\\n' "$*" > "$previous/recovery"; }
      ${script.slice(start, end)}
      trap rollback EXIT
      exit 1
    `, "test", directory], { encoding: "utf8" });
    assert.equal(fs.existsSync(path.join(directory, "recovery")), true, `Validation was not restarted. ${run.stderr}`);
    assert.equal(fs.readFileSync(path.join(directory, "recovery"), "utf8").trim(), "start learnharness-validation.service");
    assert.equal(run.status, 1, "preserve the original failure status");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("activation accepts only the existing wg0 failure after the target generation is active", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-switch-test-"));
  try {
    const script = fs.readFileSync(new URL("../scripts/deploy-hws.sh", import.meta.url), "utf8");
    const start = script.indexOf("switch_target() {");
    const end = script.indexOf("\nstopped=0", start);
    assert(start >= 0 && end > start);
    fs.mkdirSync(path.join(directory, "bin"));
    fs.writeFileSync(path.join(directory, "bin/switch-to-configuration"), '#!/usr/bin/env bash\nexit "$SWITCH_STATUS"\n', { mode: 0o755 });
    const cases = [
      { name: "existing wg0 only", before: "wg-quick-wg0.service", after: "wg-quick-wg0.service", activated: directory, status: 4, expected: 0 },
      { name: "new LearnHarness failure", before: "wg-quick-wg0.service", after: "learnharness.service\nwg-quick-wg0.service", activated: directory, status: 4, expected: 4 },
      { name: "new wg0 failure", before: "", after: "wg-quick-wg0.service", activated: directory, status: 4, expected: 4 },
      { name: "target not activated", before: "wg-quick-wg0.service", after: "wg-quick-wg0.service", activated: "/previous", status: 4, expected: 4 },
      { name: "other activation error", before: "wg-quick-wg0.service", after: "wg-quick-wg0.service", activated: directory, status: 1, expected: 1 },
    ];
    for (const fixture of cases) {
      const run = spawnSync("bash", ["-c", `
        set -euo pipefail
        target="$1"; known_failed="$2"
        failed_units() { printf '%s' "$AFTER"; }
        readlink() { printf '%s' "$ACTIVATED"; }
        ${script.slice(start, end)}
        switch_target
      `, "test", directory, fixture.before], {
        encoding: "utf8", env: { ...process.env, AFTER: fixture.after, ACTIVATED: fixture.activated, SWITCH_STATUS: String(fixture.status) },
      });
      assert.equal(run.status, fixture.expected, fixture.name + ": " + run.stderr);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
