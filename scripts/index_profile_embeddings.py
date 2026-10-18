"""Run from any directory with the project's virtual-environment Python."""

import json
import logging
import os
from pathlib import Path
import sys

import psycopg
from dotenv import load_dotenv
from psycopg.conninfo import make_conninfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services.matching.app.indexing import index_profiles  # noqa: E402


def main():
    load_dotenv(ROOT / ".env", override=False)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    counts = dict(indexed=0, skipped=0, removed=0, failed=0)
    try:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            required = ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB")
            if any(not os.getenv(key) for key in required):
                raise ValueError("Set DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB")
            database_url = make_conninfo(
                host=os.getenv("POSTGRES_HOST", "localhost"),
                port=os.getenv("POSTGRES_PORT", "5432"),
                user=os.environ["POSTGRES_USER"], password=os.environ["POSTGRES_PASSWORD"],
                dbname=os.environ["POSTGRES_DB"], connect_timeout=10,
            )
        with psycopg.connect(database_url, autocommit=True) as conn:
            counts = index_profiles(conn)
    except Exception as exc:
        logging.error("Indexing could not complete (%s); check database configuration and dependencies", type(exc).__name__)
        counts["failed"] += 1
    print(json.dumps(counts, sort_keys=True))
    return 1 if counts["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
