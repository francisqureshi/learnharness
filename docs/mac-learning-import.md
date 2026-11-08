# Import local Mac learning data into hws

The hws Mac preview already shares server data. This procedure imports a snapshot
of the original app's `~/Library/Application Support/LearnHarness/data` instead.
It leaves that original installation intact and preserves hws settings and auth.

The reviewed snapshot contains one v1 lesson (109 messages), one settled research
job, 17 nodes, four chains, and 21 coverage entries. Node positions merge without
replacing existing positions. Historical references to `/Users/mac10/Projects/`
remain historical text; this import does not copy those project directories.

`merge-learning-data.py SOURCE_DATA DESTINATION_DATA` validates the merge without
writing. `--apply` requires a stopped destination and a backup. Conflicting chat,
job or graph IDs fail rather than choosing a winner. Repeating an identical import
is a no-op. Active jobs and unsupported record versions are refused. Settings,
auth, caches, and old restore directories are excluded.

On hws, `sudo bash scripts/import-mbpro-hws.sh SOURCE_DATA` checks that the service
is idle, acquires the backup lock, stops the service, and creates a private
`pre-mac-import-TIMESTAMP.tar.gz` backup. It merges into a staged copy, swaps the
data directory, restarts, and verifies imported records, existing lesson IDs,
settings and the active ChatGPT account. Failures restore the original data.

Checks: `python3 tests/learning-import.test.py` covers conflict refusal, repeatable
imports, preserved settings/auth and rejection of active jobs. Validate the real
snapshot against an isolated backend before the production import.
