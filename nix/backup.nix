{ config, lib, pkgs, ... }:
let
  cfg = config.services.learnharness;
  backup = pkgs.writeShellApplication {
    name = "learnharness-backup";
    runtimeInputs = [ pkgs.coreutils pkgs.curl pkgs.jq pkgs.gnutar pkgs.gzip pkgs.findutils pkgs.util-linux pkgs.systemd ];
    text = builtins.readFile ./backup.sh;
  };
in {
  options.services.learnharness.backup = {
    enable = lib.mkEnableOption "daily private local snapshots of LearnHarness state and credentials";
    retentionDays = lib.mkOption { type = lib.types.ints.positive; default = 14; description = "Days to retain completed local snapshots."; };
  };
  config = lib.mkIf (cfg.enable && cfg.backup.enable) {
    systemd.timers.learnharness-backup = {
      wantedBy = [ "timers.target" ];
      timerConfig = { OnCalendar = "*-*-* 04:00:00"; Persistent = true; };
    };
    systemd.services.learnharness-backup = {
      description = "Consistent local LearnHarness snapshot";
      after = [ "learnharness.service" ];
      startLimitIntervalSec = 0;
      serviceConfig = {
        Type = "oneshot";
        ExecStart = "${lib.getExe backup} /var/lib/learnharness /var/lib/learnharness-backups ${toString cfg.port} ${toString cfg.backup.retentionDays}";
        StateDirectory = "learnharness-backups";
        StateDirectoryMode = "0700";
        UMask = "0077";
        Restart = "on-failure";
        RestartSec = "1h";
        TimeoutStartSec = "15min";
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        NoNewPrivileges = true;
      };
    };
  };
}
