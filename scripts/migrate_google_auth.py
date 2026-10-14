"""Apply migration 001 only to loopback-hosted local development, preserving all rows."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services.matching.app.config import database_dsn  # noqa: E402

MIGRATION = ROOT / "database/migrations/001_google_identity.sql"


def verify_schema(conn):
    columns = {row[0]: row[1:] for row in conn.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema='public' AND table_name='users'
    """)}
    assert columns["google_subject"][:2] == ("text", "YES"), "Invalid Google identity column"
    assert columns["alumni_verified"] == ("boolean", "NO", "false"), "Invalid alumni verification column"
    assert columns["password_hash"][1] == "YES", "Password hash must allow NULL"
    unique = conn.execute("""
        SELECT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_attribute a
            ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid='public.users'::regclass AND c.contype='u'
            AND cardinality(c.conkey)=1 AND a.attname='google_subject')
    """).fetchone()[0]
    assert unique, "Google subject must be unique"


def snapshot(conn, tables):
    """Keep only counts and hashes in memory/output; never print user or profile content."""
    result = {}
    for table in tables:
        omitted = ["google_subject", "alumni_verified"] if table == "users" else []
        statement = sql.SQL("SELECT (to_jsonb(t) - %s::text[])::text FROM {} t ORDER BY 1").format(
            sql.Identifier("public", table))
        digest, count = hashlib.sha256(), 0
        for (row,) in conn.execute(statement, (omitted,)):
            digest.update(row.encode("utf-8"))
            digest.update(b"\n")
            count += 1
        result[table] = (count, digest.hexdigest())
    return result


def migrate(apply=False):
    dsn = database_dsn()
    info = conninfo_to_dict(dsn)
    if info.get("host") not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Only loopback-hosted local development databases are permitted")
    if info.get("hostaddr") and info["hostaddr"] not in {"127.0.0.1", "::1"}:
        raise ValueError("Remote hostaddr is not permitted")
    if info.get("dbname") != "lumina":
        raise ValueError("This migration runner is restricted to the local lumina database")
    with psycopg.connect(dsn) as conn:
        conn.execute("SET LOCAL lock_timeout = '5s'")
        conn.execute("SET LOCAL statement_timeout = '30s'")
        conn.execute("LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE")
        tables = [row[0] for row in conn.execute("""
            SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
        """)]
        for table in tables:
            if table != "users":
                conn.execute(sql.SQL("LOCK TABLE {} IN SHARE MODE").format(sql.Identifier("public", table)))
        before = snapshot(conn, tables)
        names = {row[0] for row in conn.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='users'
        """)}
        already_applied = "google_subject" in names or "alumni_verified" in names
        if already_applied:
            verify_schema(conn)
        elif apply:
            conn.execute(MIGRATION.read_text(encoding="utf-8"))
            verify_schema(conn)
            assert conn.execute("""SELECT count(*) FROM public.users
                WHERE google_subject IS NOT NULL OR alumni_verified""").fetchone()[0] == 0
        after = snapshot(conn, tables)
        assert before == after, "Existing rows changed; migration will roll back"
        report = {
            "migration": MIGRATION.name,
            "target": {key: info.get(key) for key in ("host", "port", "dbname")},
            "status": "already_applied" if already_applied else "applied" if apply else "preview",
            "row_counts_before": {table: data[0] for table, data in before.items()},
            "row_counts_after": {table: data[0] for table, data in after.items()},
            "existing_data_unchanged": True,
        }
    # The connection context commits before reporting success.
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply migration 001 after preservation checks")
    args = parser.parse_args()
    try:
        print(json.dumps(migrate(args.apply), indent=2))
    except Exception as exc:
        print(f"Migration failed ({type(exc).__name__}); no sensitive details logged", file=sys.stderr)
        sys.exit(1)
