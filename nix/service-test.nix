{ pkgs, package }:
pkgs.testers.runNixOSTest {
  name = "learnharness-service";
  nodes.machine = { ... }: {
    imports = [ ./module.nix ];
    virtualisation.memorySize = 4096;
    virtualisation.cores = 2;
    services.learnharness = { enable = true; inherit package; port = 3199; };
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
