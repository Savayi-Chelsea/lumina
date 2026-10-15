"""Local-only prototype tooling. Never print connection secrets or row contents."""
import hashlib
import os
from pathlib import Path

from dotenv import load_dotenv
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

ROOT = Path(__file__).resolve().parents[1]


def local_dsn():
    load_dotenv(ROOT / ".env")
    dsn = os.getenv("DATABASE_URL") or make_conninfo(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        dbname=os.environ["POSTGRES_DB"],
        connect_timeout=10,
    )
    info = conninfo_to_dict(dsn)
    if info.get("host") not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Only loopback-hosted local development is permitted")
    if info.get("hostaddr") and info["hostaddr"] not in {"127.0.0.1", "::1"}:
        raise ValueError("Remote hostaddr is not permitted")
    if info.get("dbname") != "lumina":
        raise ValueError("Only the local lumina database is permitted")
    return dsn


def tables_and_locks(conn):
    tables = [row[0] for row in conn.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    )]
    for table in tables:
        conn.execute(sql.SQL("LOCK TABLE {} IN SHARE MODE").format(sql.Identifier("public", table)))
    return tables


def snapshot(conn, tables):
    result = {}
    for table in tables:
        digest, count = hashlib.sha256(), 0
        for (row,) in conn.execute(sql.SQL(
            "SELECT to_jsonb(t)::text FROM {} t ORDER BY 1"
        ).format(sql.Identifier("public", table))):
            digest.update(row.encode("utf-8") + b"\n")
            count += 1
        result[table] = {"count": count, "sha256": digest.hexdigest()}
    return result
