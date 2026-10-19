"""Preview/apply a local-only, idempotent repair of the original 50 demo alumni."""
import argparse
import json
import sys

import psycopg
from local_database import local_dsn, snapshot, tables_and_locks
from synthetic_identity import FIXTURE_PASSWORD, ORIGINAL_FIXTURE_EMAILS as FIXTURE_EMAILS


def counts(conn):
    return dict(zip(("total_synthetic_profiles", "verified_synthetic_alumni", "network_discoverable_alumni"), conn.execute("""
        SELECT count(*) FILTER (WHERE u.email = ANY(%s)),
          count(*) FILTER (WHERE u.email = ANY(%s) AND u.alumni_verified),
          count(*) FILTER (WHERE u.role = 'alumni' AND u.account_status = 'active'
            AND u.alumni_verified AND length(btrim(p.full_name)) > 0)
        FROM users u JOIN profiles p ON p.user_id = u.id
    """, (list(FIXTURE_EMAILS), list(FIXTURE_EMAILS))).fetchone()))


def establish(conn, apply=False):
    # Exact existing seed identities, the non-login marker and no linked Google
    # identity are all required. Never promote a signup or reactivate a suspension.
    rows = conn.execute("""SELECT email, password_hash, role, account_status, google_subject
        FROM users WHERE email = ANY(%s) ORDER BY email FOR UPDATE""", (list(FIXTURE_EMAILS),)).fetchall()
    if len(rows) != 50 or any(password != FIXTURE_PASSWORD or role != "alumni" or status != "active" or google is not None
                             for email, password, role, status, google in rows):
        raise ValueError("Expected 50 intact active non-login synthetic accounts; refusing update")
    before = counts(conn)
    if before["total_synthetic_profiles"] != 50:
        raise ValueError("Expected 50 existing synthetic profiles; refusing update")
    changed = 0
    if apply:
        changed = conn.execute("""UPDATE users SET alumni_verified = TRUE, account_status = 'active'
            WHERE email = ANY(%s) AND password_hash = %s AND google_subject IS NULL
              AND role = 'alumni' AND account_status = 'active' AND alumni_verified = FALSE""",
            (list(FIXTURE_EMAILS), FIXTURE_PASSWORD)).rowcount
    return {"status": "applied" if apply else "preview", "updated": changed, "before": before, "after": counts(conn)}


def main(apply=False):
    with psycopg.connect(local_dsn()) as conn:
        conn.execute("SET LOCAL lock_timeout = '5s'")
        conn.execute("SET LOCAL statement_timeout = '30s'")
        conn.execute("SELECT pg_advisory_xact_lock(2042004)")
        tables = tables_and_locks(conn)
        other_tables = [table for table in tables if table != "users"]
        before = snapshot(conn, other_tables)
        # Verify all other user fields and every non-fixture account remain intact.
        def users_snapshot():
            return conn.execute("""SELECT CASE WHEN email = ANY(%s)
                THEN to_jsonb(u) - 'alumni_verified' ELSE to_jsonb(u) END
                FROM users u ORDER BY id""", (list(FIXTURE_EMAILS),)).fetchall()
        users_before = users_snapshot()
        report = establish(conn, apply)
        if before != snapshot(conn, other_tables) or users_before != users_snapshot():
            raise ValueError("Unexpected data change; rolling back")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    try:
        main(parser.parse_args().apply)
    except Exception as exc:
        print(f"Synthetic fixture repair failed ({type(exc).__name__}); transaction rolled back", file=sys.stderr)
        sys.exit(1)
