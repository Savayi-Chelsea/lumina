#!/usr/bin/env bash
# One-command development setup for Linux, macOS and GitHub Codespaces.
# (Windows: see scripts/setup.ps1 and the README.)
#
#   bash scripts/setup.sh             # everything; seeds demo data only into an empty database
#   bash scripts/setup.sh --no-seed   # skip demo data
#
# Safe to re-run: .env keeps your values, and existing data is never reseeded.
set -euo pipefail
cd "$(dirname "$0")/.."
SEED=1
for arg in "$@"; do [ "$arg" = "--no-seed" ] && SEED=0; done
step() { printf '\n==> %s\n' "$*"; }
PY=.venv/bin/python

step "Environment file (.env)"
python3 scripts/setup_env.py

step "Node dependencies (npm ci)"
npm ci --no-audit --no-fund

step "Python environment (.venv, CPU-only PyTorch)"
[ -x "$PY" ] || python3 -m venv .venv
"$PY" -m pip install --quiet --upgrade pip
"$PY" -m pip install --quiet --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

step "Containers"
bash scripts/containers.sh

if [ "$SEED" = 1 ]; then
  users=$("$PY" -c 'import sys; sys.path.insert(0, "scripts")
import psycopg
from local_database import local_dsn
with psycopg.connect(local_dsn()) as c: print(c.execute("SELECT count(*) FROM users").fetchone()[0])')
  if [ "$users" = "0" ]; then
    step "Demo data (200 synthetic alumni, embeddings, community, connections, recaps)"
    "$PY" scripts/seed_database.py
    "$PY" scripts/import_alumni_registry.py --apply >/dev/null
    "$PY" scripts/index_profile_embeddings.py 2>&1 | grep -v 'HTTP Request' | tail -1
    "$PY" scripts/seed_community.py --apply
    "$PY" scripts/generate_avatars.py --apply
    "$PY" scripts/seed_connections.py --apply
    "$PY" scripts/seed_recaps.py --apply
  else
    step "Database already has $users users; demo data left as it is"
  fi
fi

if [ -f .demo-accounts.json ]; then
  step "Demo sign-in accounts (.demo-accounts.json)"
  npm run --silent demo:accounts || echo "Could not restore demo accounts; run: npm run demo:accounts"
fi

step "Browser for end-to-end tests (Playwright Chromium)"
npx --no-install playwright install chromium >/dev/null 2>&1 && echo "installed" || echo "skipped (run: npx playwright install --with-deps chromium)"

step "Done. Start everything with: bash scripts/start.sh"
