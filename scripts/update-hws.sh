#!/usr/bin/env bash
# Update the existing permanent service without replacing its state directory.
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
systemctl is-active --quiet learnharness.service
state=/var/lib/learnharness
backups=/var/lib/learnharness-backups
previous=$(readlink -f /run/current-system)
test "$(readlink -f /nix/var/nix/profiles/system)" = "$previous"
exec 9>"$backups/.lock"
flock -n 9 || { echo 'A deployment or backup is active.' >&2; exit 1; }
# The first upload-capable release upgrades a server without this endpoint.
# Only a real 404 permits that case; network/other errors must stop the update.
upload_status=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/uploads)
if test "$upload_status" = 200; then
  curl -fsS --max-time 10 http://127.0.0.1:3100/api/uploads | jq -e '.active == 0' >/dev/null
else
  test "$upload_status" = 404
fi
chats=$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/chats)
jq -e '.chats | all(.busy == false and .compacting == false)' <<<"$chats" >/dev/null || { echo 'Wait for lesson turns to finish.'; exit 1; }
while IFS= read -r chat; do
  curl -fsS --max-time 10 --get --data-urlencode "chatId=$chat" http://127.0.0.1:3100/api/jobs |
    jq -e '.turnInFlight == false and (.jobs | all(.status != "running"))' >/dev/null || { echo 'Wait for background jobs to finish.'; exit 1; }
done < <(jq -r '.chats[].id' <<<"$chats")
before_ids=$(jq -c '[.chats[].id] | sort' <<<"$chats")
before_settings=$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/settings | jq -Sc .)
before_account=$(curl -fsS --max-time 10 -H 'x-learnharness-subscriptions: 1' http://127.0.0.1:3100/api/subscriptions | jq -er '.chatgpt.activeId')

failed_units() { systemctl --failed --no-legend --plain --no-pager | awk '{print $1}' | sort; }
known_failed=$(failed_units)
switch_target() {
  local status
  if "$target/bin/switch-to-configuration" switch; then return 0; else status=$?; fi
  # NixOS uses status 4 for unit activation errors. Accept only the observed
  # pre-existing wg0 failure, and only after the target generation activated.
  if test "$status" = 4 && test "$known_failed" = wg-quick-wg0.service &&
     test "$(failed_units)" = "$known_failed" && test "$(readlink -f /run/current-system)" = "$target"; then
    echo 'NixOS activated with the pre-existing wg0 failure; checking LearnHarness independently.' >&2
    return 0
  fi
  return "$status"
}

stopped=0
switched=0
rollback() {
  result=$?
  trap - EXIT
  set +e
  if test "$result" != 0 && test "$stopped" = 1; then
    echo 'Update failed; restoring the previous service version while retaining current state.' >&2
    systemctl stop learnharness-backup.timer learnharness-backup.service learnharness.service
    if test "$switched" = 1; then
      nix-env --profile /nix/var/nix/profiles/system --set "$previous"
      "$previous/bin/switch-to-configuration" switch || echo 'Previous configuration reported errors; still restarting LearnHarness.' >&2
    fi
    systemctl start learnharness.service learnharness-backup.timer || echo 'LearnHarness recovery needs inspection.' >&2
  fi
  exit "$result"
}
trap rollback EXIT
echo 'Pausing LearnHarness, taking a private snapshot, then activating the reviewed update.'
stopped=1
systemctl stop learnharness.service
archive="$backups/pre-update-$(date -u +%Y%m%dT%H%M%S)-$RANDOM.tar.gz"
tar -czf "$archive" -C "$state" .
tar -tzf "$archive" >/dev/null
switched=1
nix-env --profile /nix/var/nix/profiles/system --set "$target"
switch_target
systemctl start learnharness.service
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
curl -fsS --max-time 10 http://127.0.0.1:3100/api/uploads | jq -e '.enabled == true and .active == 0' >/dev/null
trap - EXIT
echo 'LearnHarness updated; lessons, settings, ChatGPT connection and uploads verified.'
echo "Private pre-update snapshot: $archive"
