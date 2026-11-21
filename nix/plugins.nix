{ lib, buildNpmPackage, nodejs_24 }:
let
  ids = builtins.fromJSON (builtins.readFile ../core-plugins.json);
  hashes = {
    flashcards = "sha256-AGjSn0TFK8jx3VpgAROg9fjhZ7gT6CKBD6vr+FbZJKE=";
    coding-questions = "sha256-qge3Z50q70bjCRgYAnSezG3Jx4y64wvJYepp7511hAM=";
    drawing-pad = "sha256-SbiwseLd9dhSBNDTbr9jfbr6zruoYH5pXUSb2I6roJY=";
    rich-code-blocks = "sha256-2wt84ICmHf7YywZzLQRVswMBg99OAp43nnt9tJZcupw=";
  };
  buildPlugin = id: let
    root = ../plugins + "/${id}";
    lock = builtins.fromJSON (builtins.readFile (root + "/package-lock.json"));
  in buildNpmPackage {
    pname = "learnharness-plugin-${id}";
    version = (builtins.fromJSON (builtins.readFile (root + "/package.json"))).version;
    nodejs = nodejs_24;
    src = lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions (map (name: lib.fileset.maybeMissing (root + "/${name}")) [
        "src" "scripts" "licenses" "manifest.json" "package.json" "package-lock.json"
        "LICENSE" "THIRD-PARTY.md" "FSRS-LICENSE.txt" "README.md"
      ]);
    };
    # SDK imports are type-only and erased by esbuild. The complete SDK is
    # generated from source by the main build's authoring kit, not this bundle.
    postPatch = lib.optionalString (lock.packages ? ".sdk") ''
      mkdir -p .sdk
      cat > .sdk/package.json <<'JSON'
      ${builtins.toJSON lock.packages.".sdk"}
      JSON
    '';
    npmDepsHash = hashes.${id};
    installPhase = ''
      mkdir -p "$out"
      cp -r dist/. "$out/"
    '';
  };
in lib.genAttrs ids buildPlugin
