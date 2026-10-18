"""Add the optional Google photo column to the local lumina database safely."""
import argparse
import sys
import psycopg
from local_database import ROOT, local_dsn, tables_and_locks, snapshot

def migrate(apply=False):
    with psycopg.connect(local_dsn()) as conn:
        conn.execute("SET LOCAL lock_timeout = '5s'")
        conn.execute("SELECT pg_advisory_xact_lock(2042003)")
        tables = tables_and_locks(conn)
        others = [table for table in tables if table != "users"]
        before = snapshot(conn, others)
        users = conn.execute("SELECT (to_jsonb(u) - 'google_image_url')::text FROM public.users u ORDER BY 1").fetchall()
        if apply:
            conn.execute((ROOT / "database/migrations/003_google_profile_image.sql").read_text())
        if before != snapshot(conn, others) or users != conn.execute("SELECT (to_jsonb(u) - 'google_image_url')::text FROM public.users u ORDER BY 1").fetchall():
            raise ValueError("Existing data changed")
    print("Migration 003 applied; existing data preserved" if apply else "Migration 003 preview: nullable photo column; existing data preserved")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    try:
        migrate(parser.parse_args().apply)
    except Exception as exc:
        print(f"Profile image migration failed ({type(exc).__name__}); rolled back", file=sys.stderr)
        sys.exit(1)
