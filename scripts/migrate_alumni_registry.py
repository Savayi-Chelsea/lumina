"""Apply migration 002 only locally, comparing every existing column and row."""
import argparse
import json
import sys

import psycopg

from local_database import ROOT, local_dsn, snapshot, tables_and_locks

MIGRATION = ROOT / "database/migrations/002_alumni_registry.sql"


def migrate(apply=False):
    with psycopg.connect(local_dsn()) as conn:
        conn.execute("SET LOCAL lock_timeout = '5s'")
        conn.execute("SET LOCAL statement_timeout = '30s'")
        conn.execute("SELECT pg_advisory_xact_lock(2042002)")
        tables = tables_and_locks(conn)
        if {"alumni_registry", "verification_assistance_requests"} & set(tables):
            raise ValueError("Migration 002 tables already exist; refusing to modify them")
        before = snapshot(conn, tables)
        if apply:
            conn.execute(MIGRATION.read_text(encoding="utf-8"))
        after = snapshot(conn, tables)
        if before != after:
            raise ValueError("Existing data changed; rolling back")
        report = {
            "migration": MIGRATION.name,
            "target": "local development lumina database",
            "status": "applied" if apply else "preview",
            "before": before,
            "after": after,
            "existing_data_unchanged": True,
        }
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(migrate(args.apply), indent=2))
    except Exception as exc:
        print(f"Registry migration failed ({type(exc).__name__}); transaction rolled back", file=sys.stderr)
        sys.exit(1)
