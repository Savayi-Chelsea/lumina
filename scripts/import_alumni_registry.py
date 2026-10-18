"""Import fictional registry fixtures locally; never overwrite records or claims."""
import argparse
import json
import sys

import psycopg

from generate_alumni_registry import FIELDS, ROOT, registry_rows
from local_database import local_dsn, snapshot, tables_and_locks


def import_rows(conn, rows):
    inserted = 0
    for row in rows:
        values = tuple(row[field] for field in FIELDS)
        existing = conn.execute("""SELECT id::text, synthetic_staff_number, surname,
            former_kq_department, kq_start_year, kq_end_year
            FROM alumni_registry WHERE synthetic_staff_number = %s FOR UPDATE""",
            (row["synthetic_staff_number"],)).fetchone()
        if existing:
            if existing != values:
                raise ValueError("Conflicting fixture; refusing to overwrite registry data")
            continue
        conn.execute("""INSERT INTO alumni_registry
            (id, synthetic_staff_number, surname, former_kq_department, kq_start_year, kq_end_year)
            VALUES (%s, %s, %s, %s, %s, %s)""", values)
        inserted += 1
    return inserted


def import_registry(apply=False):
    rows = registry_rows(ROOT / "data/synthetic_alumni.csv")
    with psycopg.connect(local_dsn()) as conn:
        conn.execute("SET LOCAL lock_timeout = '5s'")
        conn.execute("SET LOCAL statement_timeout = '30s'")
        conn.execute("SELECT pg_advisory_xact_lock(2042002)")
        tables = tables_and_locks(conn)
        preserved = [table for table in tables if table != "alumni_registry"]
        before = snapshot(conn, preserved)
        existing = conn.execute("SELECT id, to_jsonb(r) FROM alumni_registry r ORDER BY id").fetchall()
        inserted = import_rows(conn, rows) if apply else 0
        after = snapshot(conn, preserved)
        assert before == after, "Existing application data changed"
        for record_id, value in existing:
            assert conn.execute("SELECT to_jsonb(r) FROM alumni_registry r WHERE id=%s", (record_id,)).fetchone()[0] == value
    return {"synthetic_only": True, "source_records": len(rows), "inserted": inserted,
            "status": "imported" if apply else "preview", "existing_data_and_claims_unchanged": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(import_registry(args.apply), indent=2))
    except Exception as exc:
        print(f"Registry import failed ({type(exc).__name__}); transaction rolled back", file=sys.stderr)
        sys.exit(1)
