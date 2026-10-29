{ lib, buildNpmPackage, nodejs_24, makeWrapper, autoPatchelfHook
, stdenv, chromium, fontconfig, makeFontsConf, jetbrains-mono, source-sans }:

buildNpmPackage {
  pname = "learnharness-server";
  version = "0.3.9";
  nodejs = nodejs_24;

  # An allowlist prevents private data, credentials and mobile configuration
  # entering the derivation even when building from a developer checkout.
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../app ../components ../src ../lib ../public ../electron ../scripts
      ../tests/fixtures/sample-3page.pdf
      ../package.json ../package-lock.json ../config.ts ../next.config.ts
      ../tsconfig.json ../next-env.d.ts ../postcss.config.mjs ../proxy.ts
      ../LICENSE
    ];
  };
  npmDepsHash = "sha256-KVRv7nerkMrEquLIk+jjNq64/HyZSNWsQnQBTTgHpjE=";
  nativeBuildInputs = [ makeWrapper autoPatchelfHook ];
  buildInputs = [ stdenv.cc.cc.lib fontconfig ];
  ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
  NEXT_TELEMETRY_DISABLED = "1";
  LD_LIBRARY_PATH = lib.makeLibraryPath [ stdenv.cc.cc.lib fontconfig ];

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
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/lib/learnharness" "$out/bin" "$out/share/learnharness"
    cp -r .next/standalone/. "$out/lib/learnharness/"
    # npm retains musl optional packages on glibc; they cannot be used here.
    find "$out/lib/learnharness/node_modules" -depth -type d -name '*linux*musl*' -exec rm -rf {} +
    cp scripts/smoke-{nix-server,provider-runtime,demo-runtime}.mjs "$out/share/learnharness/"
    cp tests/fixtures/sample-3page.pdf "$out/share/learnharness/"
    makeWrapper ${nodejs_24}/bin/node "$out/bin/learnharness-server" \
      --add-flags "$out/lib/learnharness/server.js" \
      --set NODE_ENV production \
      --set-default HOSTNAME 127.0.0.1 \
      --set-default PORT 3100 \
      --set CHROME_PATH ${chromium}/bin/chromium \
      --set FONTCONFIG_FILE ${makeFontsConf { fontDirectories = [ jetbrains-mono source-sans ]; }}
    makeWrapper ${nodejs_24}/bin/node "$out/bin/learnharness-server-check" \
      --add-flags "$out/share/learnharness/smoke-nix-server.mjs $out" \
      --set CHROME_PATH ${chromium}/bin/chromium \
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
