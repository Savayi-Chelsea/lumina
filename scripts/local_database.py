"""Local-only prototype tooling. Never print connection secrets or row contents."""
import hashlib
import re
import os
from pathlib import Path

from dotenv import load_dotenv
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

ROOT = Path(__file__).resolve().parents[1]


def is_evaluation_database(name):
    """Separate local databases used only for evaluation datasets, e.g. lumina_eval_500."""
    return bool(name) and re.fullmatch(r"lumina_eval_[a-z0-9_]{1,40}", name) is not None


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
    if info.get("dbname") != "lumina" and not is_evaluation_database(info.get("dbname")):
        raise ValueError("Only the local lumina database (or a local lumina_eval_* evaluation copy) is permitted")
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
