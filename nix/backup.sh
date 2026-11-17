set -euo pipefail
state=$1
backups=$2
port=$3
retention=$4
umask 077
exec 9>"$backups/.lock"
flock -n 9 || exit 0

# A failed/ambiguous liveness check must defer the snapshot, not stop the app.
systemctl is-active --quiet learnharness.service
uploads=$(curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$port/api/uploads")
if ! jq -e '.active == 0' <<<"$uploads" >/dev/null; then
  echo 'Deferring backup: file uploads are active.'
  exit 75
fi
chats=$(curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$port/api/chats")
if ! jq -e '.chats | all(.busy == false and .compacting == false)' <<<"$chats" >/dev/null; then
  echo 'Deferring backup: lesson work is active.'
  exit 75
fi
while IFS= read -r chat; do
  jobs=$(curl --fail --silent --show-error --max-time 10 --get --data-urlencode "chatId=$chat" "http://127.0.0.1:$port/api/jobs")
  if ! jq -e '.turnInFlight == false and (.jobs | all(.status != "running"))' <<<"$jobs" >/dev/null; then
    echo 'Deferring backup: background work is active.'
    exit 75
  fi
done < <(jq -er '.chats[].id' <<<"$chats" || test "$(jq '.chats | length' <<<"$chats")" = 0)

temporary=''
resume() {
  result=$?
  trap - EXIT
  if test -n "$temporary"; then rm -f -- "$temporary"; fi
  systemctl start learnharness.service || result=1
  exit "$result"
}
trap resume EXIT
systemctl stop learnharness.service
temporary=$(mktemp "$backups/.snapshot.XXXXXX")
tar --create --gzip --file="$temporary" --directory="$state" .
tar --list --gzip --file="$temporary" >/dev/null
archive="$backups/learnharness-$(date -u +%Y%m%dT%H%M%S)-$RANDOM.tar.gz"
mv -- "$temporary" "$archive"
temporary=''
# Prune only completed snapshots, and only after producing a new valid one.
find "$backups" -maxdepth 1 -type f -name 'learnharness-*.tar.gz' -mmin "+$((retention * 1440))" -delete
echo "Backup saved: $archive"
