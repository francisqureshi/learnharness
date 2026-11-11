{ writeShellScript, bubblewrap, chromium, coreutils, makeFontsConf, jetbrains-mono, source-sans }:
writeShellScript "learnharness-demo-browser" ''
  set -eu
  # Only a per-render directory selected by the backend may cross this boundary.
  input=$(${coreutils}/bin/realpath -e -- "''${LH_DEMO_DIRECTORY:?missing render directory}")
  case "$input" in /tmp/lh-demo-*|/tmp/lh-visual-*) ;; *) exit 64 ;; esac
  exec ${bubblewrap}/bin/bwrap \
    --unshare-all --die-with-parent --new-session \
    --ro-bind /nix/store /nix/store --proc /proc --dev /dev \
    --tmpfs /tmp --dir /etc --dir /run \
    --ro-bind "$input" "$input" --tmpfs "$input/profile" \
    --chdir /tmp --clearenv \
    --setenv PATH ${coreutils}/bin \
    --setenv XDG_CACHE_HOME /tmp/cache \
    --setenv XDG_CONFIG_HOME /tmp/config \
    --setenv FONTCONFIG_FILE ${makeFontsConf { fontDirectories = [ jetbrains-mono source-sans ]; }} \
    ${chromium}/bin/chromium "$@"
''
