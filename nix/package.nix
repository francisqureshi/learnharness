{ lib, buildNpmPackage, nodejs_24, makeWrapper, autoPatchelfHook, callPackage
, stdenv, chromium, fontconfig, makeFontsConf, jetbrains-mono, source-sans }:

let
  demoBrowser = callPackage ./demo-browser.nix { };
  plugins = callPackage ./plugins.nix { };
in
buildNpmPackage {
  pname = "learnharness-server";
  version = (builtins.fromJSON (builtins.readFile ../package.json)).version;
  nodejs = nodejs_24;

  # An allowlist prevents private data, credentials and mobile configuration
  # entering the derivation even when building from a developer checkout.
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../app ../components ../src ../lib ../public ../electron ../scripts
      ../tests/fixtures/sample-3page.pdf
      ../core-plugins.json ../docs ../skills ../examples
      (lib.fileset.unions (lib.concatMap (id:
        map (name: lib.fileset.maybeMissing (../plugins + "/${id}/${name}")) [
          "src" "scripts" "tests" "licenses" ".gitignore" "README.md" "LICENSE"
          "THIRD-PARTY.md" "FSRS-LICENSE.txt" "manifest.json" "package.json" "package-lock.json" "tsconfig.json"
        ]) [ "flashcards" "coding-questions" "drawing-pad" "rich-code-blocks" "ui-showcase" ]))
      ../package.json ../package-lock.json ../config.ts ../next.config.ts
      ../tsconfig.json ../next-env.d.ts ../postcss.config.mjs ../proxy.ts
      ../LICENSE
    ];
  };
  npmDepsHash = "sha256-ink0rVziD1xk3dVq9ORWXIe03ISSlpDuBfXtzDBBNbA=";
  nativeBuildInputs = [ makeWrapper autoPatchelfHook ];
  buildInputs = [ stdenv.cc.cc.lib fontconfig ];
  ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
  NEXT_TELEMETRY_DISABLED = "1";
  LD_LIBRARY_PATH = lib.makeLibraryPath [ stdenv.cc.cc.lib fontconfig ];

  buildPhase = ''
    runHook preBuild
    mkdir -p core-plugins
    ${lib.concatStringsSep "\n" (map (id: "cp -r ${plugins.${id}} core-plugins/${id}") (builtins.fromJSON (builtins.readFile ../core-plugins.json)))}
    node --input-type=module -e 'import {validateCorePackages} from "./scripts/build-core-plugins.mjs"; validateCorePackages(process.cwd(), "core-plugins")'
    npm run plugins:build-authoring
    # Plugins are separately bundled packages; their authoring sources are not app entrypoints.
    node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync("tsconfig.json")); p.exclude=[...(p.exclude ?? []), "plugins"]; fs.writeFileSync("tsconfig.json",JSON.stringify(p));'
    node_modules/.bin/next build
    runHook postBuild
  '';

  preBuild = ''
    mkdir -p app/nix-fonts
    cp '${jetbrains-mono}/share/fonts/truetype/JetBrainsMono[wght].ttf' app/nix-fonts/mono.ttf
    cp '${source-sans}/share/fonts/variable/SourceSans3VF-Upright.otf' app/nix-fonts/prose.otf
    substituteInPlace app/layout.tsx \
      --replace-fail 'import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";' 'import localFont from "next/font/local";' \
      --replace-fail 'JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" })' 'localFont({ src: "./nix-fonts/mono.ttf", variable: "--font-jetbrains", weight: "100 800" })' \
      --replace-fail 'Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" })' 'localFont({ src: "./nix-fonts/prose.otf", variable: "--font-sans3", weight: "200 900" })'
  '';

  postBuild = ''
    node scripts/build-server.mjs
    node scripts/smoke-provider-runtime.mjs
    node scripts/smoke-demo-runtime.mjs --standalone .next/standalone
    node_modules/.bin/esbuild src/agent/subagents/headless.ts --bundle --platform=node --packages=external --format=esm --outfile=.next/standalone/src/agent/subagents/headless-check.mjs
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/lib/learnharness" "$out/bin" "$out/share/learnharness"
    cp -r .next/standalone/. "$out/lib/learnharness/"
    # npm retains musl optional packages on glibc; they cannot be used here.
    find "$out/lib/learnharness/node_modules" -depth -type d -name '*linux*musl*' -exec rm -rf {} +
    cp scripts/smoke-{nix-server,provider-runtime,demo-runtime}.mjs "$out/share/learnharness/"
    cp scripts/smoke-isolated-demo.mjs "$out/share/learnharness/"
    cp tests/fixtures/sample-3page.pdf "$out/share/learnharness/"
    makeWrapper ${nodejs_24}/bin/node "$out/bin/learnharness-server" \
      --add-flags "$out/lib/learnharness/server.js" \
      --set NODE_ENV production \
      --set-default HOSTNAME 127.0.0.1 \
      --set-default PORT 3100 \
      --set CHROME_PATH ${chromium}/bin/chromium \
      --set LH_DEMO_BROWSER ${demoBrowser} \
      --set FONTCONFIG_FILE ${makeFontsConf { fontDirectories = [ jetbrains-mono source-sans ]; }}
    makeWrapper ${nodejs_24}/bin/node "$out/bin/learnharness-server-check" \
      --add-flags "$out/share/learnharness/smoke-nix-server.mjs $out" \
      --set CHROME_PATH ${chromium}/bin/chromium \
      --set LH_DEMO_BROWSER ${demoBrowser} \
      --set FONTCONFIG_FILE ${makeFontsConf { fontDirectories = [ jetbrains-mono source-sans ]; }}
    runHook postInstall
  '';

  meta = {
    description = "Single-process LearnHarness backend for private shared clients";
    license = lib.licenses.agpl3Only;
    platforms = [ "x86_64-linux" ];
    mainProgram = "learnharness-server";
  };
}
