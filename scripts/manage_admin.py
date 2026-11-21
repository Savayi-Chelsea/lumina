"""Grant or remove Lumina administrator access on the local development database.

  .venv/bin/python scripts/manage_admin.py list
  .venv/bin/python scripts/manage_admin.py promote you@example.com
  .venv/bin/python scripts/manage_admin.py demote you@example.com

Create the account first through the app (Continue with Google, or Join with an
email and password), then promote it. Promotion activates a pending account;
it never reactivates a suspended one and never touches synthetic fixtures.
Every change is written to the append-only audit log (actor: command line).
Local-only: refuses any database other than the loopback `lumina` database.
"""
import argparse
import json
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
from local_database import local_dsn  # noqa: E402

SYNTHETIC = "%@synthetic.lumina.local"


def promote(conn, email):
    row = conn.execute("SELECT id, role, account_status FROM users WHERE lower(email) = lower(%s) FOR UPDATE", (email,)).fetchone()
    if not row:
        return "No account uses that email. Sign up in the app first, then run this again."
    user_id, role, status = row
    if email.lower().endswith("@synthetic.lumina.local"):
        return "Synthetic fixture accounts cannot become administrators."
    if status == "suspended":
        return "That account is suspended; reinstate it before granting administrator access."
    if role == "admin":
        return "Already an administrator; nothing changed."
    conn.execute("""UPDATE users SET role = 'admin',
        account_status = CASE WHEN account_status = 'pending' THEN 'active' ELSE account_status END,
        updated_at = CURRENT_TIMESTAMP WHERE id = %s AND email NOT LIKE %s""", (user_id, SYNTHETIC))
    conn.execute("INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES (NULL, 'user.promote_admin', 'user', %s, %s)",
                 (str(user_id), json.dumps({"via": "command line", "previous_status": status})))
    return "Administrator access granted. Reload Lumina: roles are read from the database on every request, so /admin is available now."


def demote(conn, email):
    row = conn.execute("SELECT id, role FROM users WHERE lower(email) = lower(%s) FOR UPDATE", (email,)).fetchone()
    if not row or row[1] != "admin":
        return "No administrator uses that email; nothing changed."
    conn.execute("UPDATE users SET role = 'alumni', updated_at = CURRENT_TIMESTAMP WHERE id = %s", (row[0],))
    conn.execute("INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES (NULL, 'user.demote_admin', 'user', %s, %s)",
                 (str(row[0]), json.dumps({"via": "command line"})))
    return "Administrator access removed."


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["list", "promote", "demote"])
    parser.add_argument("email", nargs="?")
    args = parser.parse_args()
    if args.command != "list" and not args.email:
        parser.error("an email is required")
    with psycopg.connect(local_dsn()) as conn:
        if args.command == "list":
            rows = conn.execute("SELECT email, account_status FROM users WHERE role = 'admin' ORDER BY email").fetchall()
            print("\n".join(f"{email} ({status})" for email, status in rows) or "No administrators yet.")
            return
        with conn.transaction():
            print((promote if args.command == "promote" else demote)(conn, args.email.strip()))


if __name__ == "__main__":
    main()
