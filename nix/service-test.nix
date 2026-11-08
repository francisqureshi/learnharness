{ pkgs, package }:
pkgs.testers.runNixOSTest {
  name = "learnharness-service";
  nodes.machine = { ... }: {
    imports = [ ./module.nix ];
    virtualisation.memorySize = 4096;
    virtualisation.cores = 2;
    services.learnharness = { enable = true; inherit package; port = 3199; backup.enable = true; };
    systemd.tmpfiles.rules = [
      "f /home/lh-isolation-canary 0644 root root - private-home"
      "f /tmp/lh-isolation-canary 0644 root root - private-tmp"
    ];
    systemd.services.learnharness.serviceConfig.ExecStartPost = pkgs.writeShellScript "check-service-boundary" ''
      set -eu
      test ! -r /home/lh-isolation-canary
      test ! -e /tmp/lh-isolation-canary
      if touch /etc/lh-must-not-write 2>/dev/null; then exit 1; fi
      touch /var/cache/learnharness/writable
      touch /var/lib/learnharness/isolation-passed
      ${package}/bin/learnharness-server-check
    '';
  };
  testScript = ''
    import json
    import shlex
    start_all()
    machine.wait_for_unit("learnharness.service")
    machine.wait_for_open_port(3199)
    machine.succeed("curl -fsS http://127.0.0.1:3199/ >/dev/null")
    machine.succeed("test -e /var/lib/learnharness/isolation-passed")
    machine.succeed("test -e /var/cache/learnharness/writable")
    machine.succeed("test $(stat -c %a /var/lib/learnharness) = 700")
    machine.succeed("test $(stat -c %U /var/lib/learnharness) = learnharness")
    machine.succeed("ss -ltn | grep '127.0.0.1:3199'")
    machine.succeed("curl -fsS -X POST -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3199' -H 'x-learnharness-subscriptions: 1' --data '{\"providerId\":\"chatgpt\",\"op\":\"login\"}' http://127.0.0.1:3199/api/subscriptions")
    machine.succeed("ss -ltn | grep '127.0.0.1:1455'")
    assert machine.succeed("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1455/auth/callback?state=invalid") == "400"
    machine.succeed("curl -fsS -X POST -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3199' -H 'x-learnharness-subscriptions: 1' --data '{\"providerId\":\"chatgpt\",\"op\":\"cancel\"}' http://127.0.0.1:3199/api/subscriptions")
    machine.succeed("test $(stat -c %a /var/lib/learnharness/chatgpt-credentials.json) = 600")
    machine.succeed("curl -fsS -X PUT -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3199' --data '{\"mode\":\"light\"}' http://127.0.0.1:3199/api/settings/appearance")
    saved = json.loads(machine.succeed("curl -fsS http://127.0.0.1:3199/api/settings"))
    assert saved["settings"]["appearance"]["mode"] == "light"
    chat = json.loads(machine.succeed("curl -fsS -X POST -H 'Content-Type: application/json' --data '{\"title\":\"Backup deferral fixture\"}' http://127.0.0.1:3199/api/chats"))
    active = json.dumps({"id": "backup_fixture", "chatId": chat["id"], "kind": "demo", "status": "running", "updatedAt": "2026-01-01T00:00:00Z"})
    machine.succeed("mkdir -p /var/lib/learnharness/data/jobs")
    machine.succeed("echo " + shlex.quote(active) + " > /var/lib/learnharness/data/jobs/backup_fixture.json")
    pid = machine.succeed("systemctl show -p MainPID --value learnharness")
    machine.fail("systemctl start learnharness-backup.service")
    assert machine.succeed("systemctl show -p MainPID --value learnharness") == pid
    machine.succeed("systemctl stop learnharness-backup.service")
    machine.succeed("rm /var/lib/learnharness/data/jobs/backup_fixture.json")
    machine.succeed("touch -d '16 days ago' /var/lib/learnharness-backups/learnharness-expired.tar.gz /var/lib/learnharness-backups/unrelated.txt")
    machine.succeed("systemctl start learnharness-backup.service")
    machine.wait_for_unit("learnharness.service")
    machine.succeed("test $(stat -c %a /var/lib/learnharness-backups) = 700")
    machine.succeed("test ! -e /var/lib/learnharness-backups/learnharness-expired.tar.gz; test -e /var/lib/learnharness-backups/unrelated.txt")
    archive = machine.succeed("find /var/lib/learnharness-backups -name 'learnharness-*.tar.gz' | head -n 1").strip()
    assert archive
    machine.succeed(f"test $(stat -c %a {archive}) = 600")
    machine.succeed("curl -fsS -X PUT -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3199' --data '{\"mode\":\"dark\"}' http://127.0.0.1:3199/api/settings/appearance")
    machine.succeed("systemctl stop learnharness.service")
    machine.succeed(f"tar -xzf {archive} -C /var/lib/learnharness")
    machine.succeed("systemctl start learnharness.service")
    assert json.loads(machine.succeed("curl -fsS http://127.0.0.1:3199/api/settings")) == saved
    before = machine.succeed("curl -fsS http://127.0.0.1:3199/api/graph")
    json.loads(before)
    machine.succeed("systemctl kill --signal=SIGKILL learnharness.service")
    machine.wait_until_succeeds("test $(systemctl show -p NRestarts --value learnharness) -ge 1")
    machine.wait_until_succeeds("curl -fsS http://127.0.0.1:3199/api/graph >/dev/null")
    assert json.loads(machine.succeed("curl -fsS http://127.0.0.1:3199/api/graph")) == json.loads(before)
    machine.succeed("test -e /var/lib/learnharness/isolation-passed")
    assert json.loads(machine.succeed("curl -fsS http://127.0.0.1:3199/api/settings")) == saved
    machine.shutdown()
    machine.start()
    machine.wait_for_unit("learnharness.service")
    machine.wait_for_open_port(3199)
    assert json.loads(machine.succeed("curl -fsS http://127.0.0.1:3199/api/settings")) == saved
  '';
}
