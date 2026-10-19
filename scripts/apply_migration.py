"""Preview/apply an additive numbered migration to the local lumina database.

Every table that existed beforehand is fingerprinted and must be byte-identical
afterwards, so a migration here can only add structure, never change data.
"""
import argparse
import sys

import psycopg
from local_database import ROOT, local_dsn, snapshot, tables_and_locks

ADDITIVE = {
    "004": ("004_events_opportunities.sql", {"events", "event_registrations", "opportunities"}),
    "005": ("005_password_reset.sql", {"password_reset_tokens"}),
}


def migrate(number, apply=False):
    filename, created = ADDITIVE[number]
    with psycopg.connect(local_dsn()) as conn:
        conn.execute("SET LOCAL lock_timeout = '5s'")
        conn.execute("SELECT pg_advisory_xact_lock(2042000 + %s)", (int(number),))
        existing = tables_and_locks(conn)
        before = snapshot(conn, existing)
        pending = sorted(created - set(existing))
        if apply:
            conn.execute((ROOT / "database/migrations" / filename).read_text())
        if before != snapshot(conn, existing):
            raise ValueError("Existing data changed")
        if apply and not created <= set(row[0] for row in conn.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname='public'")):
            raise ValueError("Expected tables were not created")
    verb = "applied" if apply else "preview"
    print(f"Migration {number} {verb}: new tables {', '.join(pending) or 'already present'}; existing data preserved")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("number", choices=sorted(ADDITIVE))
    parser.add_argument("--apply", action="store_true")
    arguments = parser.parse_args()
    try:
        migrate(arguments.number, arguments.apply)
    except Exception as exc:
        print(f"Migration {arguments.number} failed ({type(exc).__name__}); rolled back", file=sys.stderr)
        sys.exit(1)
