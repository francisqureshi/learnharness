#!/usr/bin/env bash
# One-time cutover from this project's validation service to the built NixOS system.
# Run on hws with sudo; never pass credentials as arguments.
set -euo pipefail
export PATH=/run/current-system/sw/bin
umask 077
test "$(id -u)" = 0 || { echo 'Run this script with sudo on hws.' >&2; exit 1; }
test "$(hostname)" = hws
target=$(readlink -f "${1:?Pass the reviewed NixOS system build}")
case "$target" in /nix/store/*-nixos-system-hws-*) ;; *) exit 1 ;; esac
test -x "$target/bin/switch-to-configuration"
test -f "$target/etc/systemd/system/learnharness.service"
test -f "$target/etc/systemd/system/learnharness-backup.timer"
source=/home/fq/.local/share/learnharness-validation
state=/var/lib/learnharness
backups=/var/lib/learnharness-backups
test -d "$source/data" && test ! -L "$source"
if test -d "$state" && test -n "$(find "$state" -mindepth 1 -maxdepth 1 -print -quit)"; then
  echo "Refusing to overwrite existing permanent state: $state" >&2
  exit 1
fi
fq_uid=$(id -u fq)
fq_group=$(id -gn fq)
user_service() { runuser -u fq -- env XDG_RUNTIME_DIR="/run/user/$fq_uid" systemctl --user "$@"; }
user_service is-active --quiet learnharness-validation.service
previous=$(readlink -f /run/current-system)
test "$(readlink -f /nix/var/nix/profiles/system)" = "$previous"
install -d -m 0700 "$backups"
exec 9>"$backups/.lock"
flock -n 9 || { echo 'Another cutover or backup is active.' >&2; exit 1; }

chats=$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/chats)
jq -e '.chats | all(.busy == false and .compacting == false)' <<<"$chats" >/dev/null || { echo 'Wait for lesson turns to finish.'; exit 1; }
while IFS= read -r chat; do
  curl -fsS --max-time 10 --get --data-urlencode "chatId=$chat" http://127.0.0.1:3100/api/jobs |
    jq -e '.turnInFlight == false and (.jobs | all(.status != "running"))' >/dev/null || { echo 'Wait for background jobs to finish.'; exit 1; }
done < <(jq -r '.chats[].id' <<<"$chats")
before_ids=$(jq -c '[.chats[].id] | sort' <<<"$chats")
before_settings=$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/settings | jq -Sc .)
before_account=$(curl -fsS --max-time 10 -H 'x-learnharness-subscriptions: 1' http://127.0.0.1:3100/api/subscriptions | jq -er '.chatgpt.activeId')

stopped=0
copied=0
switched=0
rollback() {
  result=$?
  trap - EXIT
  if test "$result" != 0 && test "$stopped" = 1; then
    echo 'Cutover failed; restoring the previous system and validation service.' >&2
    systemctl stop learnharness-backup.timer learnharness-backup.service learnharness.service 2>/dev/null || true
    if test "$copied" = 1; then
      # Preserve any token rotation performed by the new server before failure.
      rsync -a --delete "$state/" "$source/"
      chown -R "fq:$fq_group" "$source"
    fi
    if test "$switched" = 1; then
      nix-env --profile /nix/var/nix/profiles/system --set "$previous"
      "$previous/bin/switch-to-configuration" switch
    fi
    user_service start learnharness-validation.service
  fi
  exit "$result"
}
trap rollback EXIT
echo 'Stopping validation server, saving a private snapshot, then activating the permanent service.'
stopped=1
user_service stop learnharness-validation.service
archive="$backups/pre-cutover-$(date -u +%Y%m%dT%H%M%S).tar.gz"
tar -czf "$archive" -C "$source" .
tar -tzf "$archive" >/dev/null
install -d -m 0700 "$state"
cp -a "$source/." "$state/"
copied=1
# systemd StateDirectory changes ownership recursively to the new service user.
switched=1
nix-env --profile /nix/var/nix/profiles/system --set "$target"
"$target/bin/switch-to-configuration" switch
for _attempt in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:3100/api/chats >/dev/null; then break; fi
  sleep 1
done
systemctl is-active --quiet learnharness.service
test "$(stat -c %U "$state")" = learnharness
test "$(stat -c %a "$state/chatgpt-credentials.json")" = 600
test "$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/chats | jq -c '[.chats[].id] | sort')" = "$before_ids"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/settings | jq -Sc .)" = "$before_settings"
test "$(curl -fsS --max-time 10 -H 'x-learnharness-subscriptions: 1' http://127.0.0.1:3100/api/subscriptions | jq -er '.chatgpt.activeId')" = "$before_account"
systemctl is-enabled --quiet learnharness.service
systemctl is-active --quiet learnharness-backup.timer
trap - EXIT
echo 'Permanent LearnHarness service is active; lessons, settings and ChatGPT connection verified.'
echo "Private pre-cutover snapshot: $archive"
echo 'Daily backups: 04:00 local time, 14-day retention, deferred during active work.'
