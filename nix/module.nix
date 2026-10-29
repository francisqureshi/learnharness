{ config, lib, pkgs, ... }:
let
  cfg = config.services.learnharness;
in {
  options.services.learnharness = {
    enable = lib.mkEnableOption "the private LearnHarness backend";
    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix { };
      description = "The LearnHarness server package.";
    };
    port = lib.mkOption {
      type = lib.types.port;
      default = 3100;
      description = "Loopback HTTP port; expose only through a private authenticated proxy.";
    };
  };

  config = lib.mkIf cfg.enable {
    users.groups.learnharness = { };
    users.users.learnharness = {
      isSystemUser = true;
      group = "learnharness";
      home = "/var/lib/learnharness";
    };
    systemd.services.learnharness = {
      description = "LearnHarness shared learning backend";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];
      environment = {
        HOSTNAME = "127.0.0.1";
        PORT = toString cfg.port;
        LH_DATA_DIR = "/var/lib/learnharness/data";
        LH_AUTH_FILE = "/var/lib/learnharness/auth.json";
        XDG_CACHE_HOME = "/var/cache/learnharness";
      };
      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        User = "learnharness";
        Group = "learnharness";
        StateDirectory = "learnharness";
        StateDirectoryMode = "0700";
        CacheDirectory = "learnharness";
        CacheDirectoryMode = "0700";
        WorkingDirectory = "/var/lib/learnharness";
        UMask = "0077";
        Restart = "on-failure";
        RestartSec = 5;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        NoNewPrivileges = true;
      };
    };
  };
}
