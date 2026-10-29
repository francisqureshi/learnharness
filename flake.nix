{
  description = "LearnHarness shared Linux backend";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/25f538306313eae3927264466c70d7001dcea1df";

  outputs = { self, nixpkgs }: let
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
    testHost = nixpkgs.lib.nixosSystem {
      inherit system;
      modules = [
        self.nixosModules.default
        {
          system.stateVersion = "26.05";
          boot.isContainer = true;
          services.learnharness.enable = true;
          services.learnharness.package = self.packages.${system}.default;
          services.learnharness.port = 3199;
        }
      ];
    };
    service = testHost.config.systemd.services.learnharness;
  in {
    packages.${system}.default = pkgs.callPackage ./nix/package.nix { };
    nixosModules.default = import ./nix/module.nix;
    checks.${system} = {
    package = self.packages.${system}.default;
    module =
      assert service.environment.HOSTNAME == "127.0.0.1";
      assert service.environment.PORT == "3199";
      assert service.environment.LH_DATA_DIR == "/var/lib/learnharness/data";
      assert service.serviceConfig.User == "learnharness";
      assert service.serviceConfig.UMask == "0077";
      assert service.serviceConfig.ProtectHome;
      assert builtins.elem "multi-user.target" service.wantedBy;
      assert !(builtins.elem 3199 testHost.config.networking.firewall.allowedTCPPorts);
      pkgs.writeText "learnharness-service-unit" testHost.config.systemd.units."learnharness.service".text;
    };
  };
}
