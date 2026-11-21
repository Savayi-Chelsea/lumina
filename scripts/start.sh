#!/usr/bin/env bash
# Start the whole of Lumina in one terminal; Ctrl+C stops everything.
#
#   bash scripts/start.sh          # production build of the web app (rebuilt when sources changed)
#   bash scripts/start.sh --dev    # next dev with hot reload instead
#
# Runs: Docker services, the matching API (:8000), the Kafka re-indexing worker,
# the email worker, and the web app (:3000). Logs are prefixed by process name
# and also written to .logs/.
set -uo pipefail
cd "$(dirname "$0")/.."
MODE=start
[ "${1:-}" = "--dev" ] && MODE=dev
mkdir -p .logs
PIDS=()
kill_tree() { local child; for child in $(pgrep -P "$1"); do kill_tree "$child"; done; kill "$1" 2>/dev/null; }
cleanup() { trap - INT TERM EXIT; echo; echo "Stopping Lumina..."; for pid in "${PIDS[@]}"; do kill_tree "$pid"; done; wait 2>/dev/null; }
trap cleanup INT TERM EXIT
run() { # run NAME COMMAND...
  local name="$1"; shift
  ( "$@" 2>&1 | tee ".logs/$name.log" | sed -u "s/^/[$name] /" ) &
  PIDS+=($!)
}

bash scripts/containers.sh || exit 1
python3 scripts/setup_env.py --quiet

if [ "$MODE" = start ]; then
  newest=$(find src public next.config.ts package.json -type f -newer .next/BUILD_ID 2>/dev/null | head -1)
  if [ ! -f .next/BUILD_ID ] || [ -n "$newest" ]; then
    echo "Building the web app (sources changed since the last build)..."
    npm run build || exit 1
  fi
fi

run matching .venv/bin/python -m uvicorn services.matching.app.main:app --host 127.0.0.1 --port 8000
run events .venv/bin/python scripts/run_profile_events.py
run email .venv/bin/python scripts/run_notifications.py
if [ "$MODE" = dev ]; then run web npx next dev --port 3000; else run web npx next start --port 3000; fi

# Load the BGE model before the first search so the demo starts warm.
( for _ in $(seq 1 120); do curl -sf -m 300 http://127.0.0.1:8000/ready >/dev/null && { echo "[matching] model loaded; mentor search is ready"; break; }; sleep 2; done ) &
PIDS+=($!)

if [ "${CODESPACES:-}" = "true" ]; then
  echo "Lumina: https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}   Mailpit: port 8025"
else
  echo "Lumina: http://localhost:3000   Mailpit: http://localhost:8025"
fi
wait
