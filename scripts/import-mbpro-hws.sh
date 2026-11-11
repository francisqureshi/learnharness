#!/usr/bin/env bash
# Import the reviewed Mac learning snapshot, retaining all hws preferences/auth.
set -euo pipefail
export PATH=/run/current-system/sw/bin
umask 077
test "$(id -u)" = 0 || { echo 'Run this script with sudo on hws.' >&2; exit 1; }
test "$(hostname)" = hws
source_dir=${1:?Pass the reviewed source data directory}
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
state=/var/lib/learnharness
backups=/var/lib/learnharness-backups
exec 9>"$backups/.lock"
flock -n 9 || { echo 'A deployment or backup is active.' >&2; exit 1; }
systemctl is-active --quiet learnharness.service
curl -fsS --max-time 10 http://127.0.0.1:3100/api/uploads | jq -e '.active == 0' >/dev/null
chats=$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/chats)
jq -e '.chats | all(.busy == false and .compacting == false)' <<<"$chats" >/dev/null
while IFS= read -r id; do
  curl -fsS --max-time 10 --get --data-urlencode "chatId=$id" http://127.0.0.1:3100/api/jobs |
    jq -e '.turnInFlight == false and (.jobs | all(.status != "running"))' >/dev/null
done < <(jq -r '.chats[].id' <<<"$chats")
before_settings=$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/settings | jq -Sc .)
before_account=$(curl -fsS --max-time 10 -H 'x-learnharness-subscriptions: 1' http://127.0.0.1:3100/api/subscriptions | jq -er '.chatgpt.activeId')
python3 "$script_dir/merge-learning-data.py" "$source_dir" "$state/data"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d "$state/.import-XXXXXXXX")
old="$stage/original-data"
swapped=0
stopped=0
cleanup() {
  result=$?
  trap - EXIT
  if test "$result" != 0 && test "$swapped" = 1; then
    systemctl stop learnharness.service
    if test -d "$state/data"; then mv "$state/data" "$stage/failed-data"; fi
    mv "$old" "$state/data"
    echo "Import failed; restored original data. Inspection files: $stage" >&2
  fi
  if test "$stopped" = 1; then systemctl start learnharness.service; fi
  if test "$result" = 0; then rm -rf -- "$stage"; fi
  exit "$result"
}
trap cleanup EXIT
systemctl stop learnharness.service
stopped=1
tar -C "$state" -czf "$backups/pre-mac-import-$stamp.tar.gz" data
cp -a --reflink=auto "$state/data" "$stage/data"
python3 "$script_dir/merge-learning-data.py" "$source_dir" "$stage/data" --apply
chown -R learnharness:learnharness "$stage/data"
mv "$state/data" "$old"
# Mark the rollback boundary before installing the staged directory.
swapped=1
mv "$stage/data" "$state/data"
systemctl start learnharness.service
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:3100/api/chats > "$stage/chats.json"; then break; fi
  sleep 1
done
jq -e --argjson old "$chats" '([.chats[].id] as $ids | all($old.chats[]; .id as $id | $ids | index($id)))' "$stage/chats.json" >/dev/null
python3 "$script_dir/merge-learning-data.py" "$source_dir" "$state/data" > "$stage/verification.json"
jq -e '.new_records | all(. == 0)' "$stage/verification.json" >/dev/null
test "$(curl -fsS --max-time 10 http://127.0.0.1:3100/api/settings | jq -Sc .)" = "$before_settings"
test "$(curl -fsS --max-time 10 -H 'x-learnharness-subscriptions: 1' http://127.0.0.1:3100/api/subscriptions | jq -er '.chatgpt.activeId')" = "$before_account"
echo "Mac learning data merged. Existing lessons, settings and ChatGPT connection verified."
echo "Backup: $backups/pre-mac-import-$stamp.tar.gz"
