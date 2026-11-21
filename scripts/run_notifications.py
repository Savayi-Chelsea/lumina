"""Background email and housekeeping worker.

Every minute it:
  * emails both people a reminder about sessions starting within 24 hours;
  * on Monday mornings (Nairobi), sends the weekly digest to members who opted in;
  * deletes mentor-search logs older than 180 days (privacy retention).

Every email respects the member's choices in Privacy and data, and the
email_deliveries ledger guarantees each email is sent at most once.

  .venv/Scripts/python.exe scripts/run_notifications.py            # keep running
  .venv/Scripts/python.exe scripts/run_notifications.py --once     # one pass
  .venv/Scripts/python.exe scripts/run_notifications.py --once --digest-now
"""
import argparse
import html
import logging
import os
import signal
import smtplib
import sys
import threading
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from local_database import local_dsn  # noqa: E402

EAT = timezone(timedelta(hours=3))
SEARCH_RETENTION_DAYS = 180
SYNTHETIC = "@synthetic.lumina.local"
MODES = {"video": "Video call", "phone": "Phone call", "in_person": "In person"}
logger = logging.getLogger("lumina.notifications")


def nairobi(value):
    return value.astimezone(EAT).strftime("%a %d %b %Y, %H:%M")


class Mailer:
    def __init__(self):
        load_dotenv(ROOT / ".env", override=False)
        self.host, self.port, self.sender = os.getenv("SMTP_HOST"), os.getenv("SMTP_PORT"), os.getenv("MAIL_FROM")
        self.origin = (os.getenv("APP_ORIGIN") or "http://localhost:3000").rstrip("/")
        if not (self.host and self.port and self.sender):
            raise RuntimeError("SMTP_HOST, SMTP_PORT and MAIL_FROM must be set")

    def send(self, to, subject, lines):
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = self.sender, to, subject
        message.set_content("\n".join(lines))
        body = "".join(f"<p>{html.escape(line)}</p>" for line in lines if line)
        message.add_alternative(f'<div style="font-family:Arial,sans-serif;max-width:560px;color:#292529">'
                                f'<h1 style="font-family:Georgia,serif;font-weight:500;color:#481729">{html.escape(subject)}</h1>{body}</div>', subtype="html")
        with smtplib.SMTP(self.host, int(self.port), timeout=15) as smtp:
            if os.getenv("SMTP_SECURE") == "true":
                smtp.starttls()
            if os.getenv("SMTP_USER"):
                smtp.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD", ""))
            smtp.send_message(message)


def claim(conn, user_id, kind, reference):
    """Records the delivery first; a duplicate claim means it was already sent."""
    return conn.execute("""INSERT INTO email_deliveries (user_id, kind, reference) VALUES (%s, %s, %s)
        ON CONFLICT (user_id, kind, reference) DO NOTHING RETURNING id""", (user_id, kind, reference)).fetchone() is not None


def release(conn, user_id, kind, reference):
    conn.execute("DELETE FROM email_deliveries WHERE user_id = %s AND kind = %s AND reference = %s", (user_id, kind, reference))


def send_reminders(conn, mailer, now=None):
    """Sessions starting in the next 24 hours that haven't had a reminder yet."""
    now = now or datetime.now(timezone.utc)
    sessions = conn.execute("""
        SELECT s.id, a.starts_at, a.ends_at, a.mode, a.details, s.agenda, r.goal,
            r.mentor_id, r.mentee_id, mu.email AS mentor_email, eu.email AS mentee_email,
            mp.full_name AS mentor_name, ep.full_name AS mentee_name
        FROM mentorship_sessions s JOIN mentor_availability a ON a.id = s.slot_id
        JOIN mentorship_requests r ON r.id = s.mentorship_id
        JOIN users mu ON mu.id = r.mentor_id JOIN profiles mp ON mp.user_id = mu.id
        JOIN users eu ON eu.id = r.mentee_id JOIN profiles ep ON ep.user_id = eu.id
        WHERE s.status = 'booked' AND s.reminder_sent_at IS NULL AND a.starts_at > %s AND a.starts_at <= %s + INTERVAL '24 hours'
        ORDER BY a.starts_at""", (now, now)).fetchall()
    sent = 0
    for row in sessions:
        failed = False
        for user_id, email, other in ((row["mentor_id"], row["mentor_email"], row["mentee_name"]), (row["mentee_id"], row["mentee_email"], row["mentor_name"])):
            prefs = conn.execute("SELECT session_emails FROM email_preferences WHERE user_id = %s", (user_id,)).fetchone()
            if email.endswith(SYNTHETIC) or (prefs and not prefs["session_emails"]) or not claim(conn, user_id, "session_reminder", str(row["id"])):
                continue
            lines = [f"A reminder that your mentoring session with {other} is coming up.", "",
                     f"When: {nairobi(row['starts_at'])} to {row['ends_at'].astimezone(EAT):%H:%M} (Nairobi time)",
                     f"How: {MODES.get(row['mode'], row['mode'])}", *([f"Where: {row['details']}"] if row["details"] else []),
                     *([f"Agenda: {row['agenda']}"] if row["agenda"] else []), "", f"Your sessions: {mailer.origin}/mentorship/sessions"]
            try:
                mailer.send(email, f"Reminder: mentoring session with {other}", lines)
                sent += 1
            except Exception as exc:  # Release the claim so the next pass retries.
                release(conn, user_id, "session_reminder", str(row["id"]))
                failed = True
                logger.error("Reminder email failed (%s)", type(exc).__name__)
        if not failed:  # Delivered (or not wanted) for both people; the ledger stops duplicates either way.
            conn.execute("UPDATE mentorship_sessions SET reminder_sent_at = %s WHERE id = %s", (now, row["id"]))
    return sent


def digest_week(now):
    year, week, _ = now.astimezone(EAT).isocalendar()
    return f"{year}-W{week:02d}"


def digest_for(conn, user_id, now):
    """The member's own week at a glance; returns None when there's nothing to say."""
    counts = conn.execute("""SELECT
        (SELECT count(*) FROM connections WHERE addressee_id = %(u)s AND status = 'pending') AS invitations,
        (SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
          WHERE %(u)s IN (c.user_a, c.user_b) AND m.sender_id <> %(u)s AND m.read_at IS NULL) AS unread,
        (SELECT count(*) FROM mentorship_requests WHERE mentor_id = %(u)s AND status = 'pending') AS requests,
        (SELECT count(*) FROM session_recaps WHERE partner_id = %(u)s AND status = 'pending') AS recaps_to_approve,
        (SELECT count(*) FROM session_recaps WHERE status = 'published' AND hidden_at IS NULL AND decided_at > %(now)s - INTERVAL '7 days') AS new_recaps
        """, {"u": user_id, "now": now}).fetchone()
    sessions = conn.execute("""SELECT a.starts_at, p.full_name AS other FROM mentorship_sessions s
        JOIN mentor_availability a ON a.id = s.slot_id JOIN mentorship_requests r ON r.id = s.mentorship_id
        JOIN profiles p ON p.user_id = CASE WHEN r.mentor_id = %(u)s THEN r.mentee_id ELSE r.mentor_id END
        WHERE s.status = 'booked' AND %(u)s IN (r.mentor_id, r.mentee_id) AND a.starts_at BETWEEN %(now)s AND %(now)s + INTERVAL '7 days'
        ORDER BY a.starts_at LIMIT 5""", {"u": user_id, "now": now}).fetchall()
    events = conn.execute("""SELECT title, starts_at FROM events WHERE status = 'published' AND starts_at BETWEEN %(now)s AND %(now)s + INTERVAL '14 days'
        ORDER BY starts_at LIMIT 2""", {"now": now}).fetchall()
    lines = []
    for count, singular, plural in ((counts["invitations"], "connection invitation", "connection invitations"),
                                    (counts["unread"], "unread message", "unread messages"),
                                    (counts["requests"], "mentorship request to answer", "mentorship requests to answer"),
                                    (counts["recaps_to_approve"], "session recap to approve", "session recaps to approve")):
        if count:
            lines.append(f"• {count} {singular if count == 1 else plural}")
    lines += [f"• Session with {s['other']} on {nairobi(s['starts_at'])}" for s in sessions]
    if counts["new_recaps"]:
        lines.append(f"• {counts['new_recaps']} new session recap{'s' if counts['new_recaps'] != 1 else ''} from the community")
    lines += [f"• Event: {e['title']}, {nairobi(e['starts_at'])}" for e in events]
    return lines or None


def send_digests(conn, mailer, now=None, force=False):
    """Monday 07:00–11:59 Nairobi (or `force`), once per member per ISO week."""
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(EAT)
    if not force and not (local.weekday() == 0 and 7 <= local.hour < 12):
        return 0
    week = digest_week(now)
    members = conn.execute("""SELECT u.id, u.email, p.full_name FROM email_preferences e JOIN users u ON u.id = e.user_id
        JOIN profiles p ON p.user_id = u.id
        WHERE e.weekly_digest AND u.account_status = 'active' AND u.alumni_verified AND u.email NOT LIKE %s""", (f"%{SYNTHETIC}",)).fetchall()
    sent = 0
    for member in members:
        items = digest_for(conn, member["id"], now)
        if not items or not claim(conn, member["id"], "weekly_digest", week):
            continue
        first = (member["full_name"] or "there").split()[0]
        lines = [f"Hi {first}, here's your week on Lumina:", "", *items, "", f"Open Lumina: {mailer.origin}/",
                 f"Change email choices: {mailer.origin}/account/privacy"]
        try:
            mailer.send(member["email"], "Your week on Lumina", lines)
            sent += 1
        except Exception as exc:
            release(conn, member["id"], "weekly_digest", week)
            logger.error("Digest email failed (%s)", type(exc).__name__)
    return sent


def purge_search_logs(conn):
    return conn.execute("DELETE FROM mentor_search_events WHERE created_at < CURRENT_TIMESTAMP - make_interval(days => %s)",
                        (SEARCH_RETENTION_DAYS,)).rowcount


def run_once(conn, mailer, force_digest=False):
    result = {"reminders": send_reminders(conn, mailer), "digests": send_digests(conn, mailer, force=force_digest),
              "purged_searches": purge_search_logs(conn)}
    logger.info("Pass complete: %s", result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--digest-now", action="store_true", help="send this week's digest now instead of waiting for Monday")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    mailer, dsn = Mailer(), local_dsn()
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    force = args.digest_now
    while not stop.is_set():
        try:
            with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
                run_once(conn, mailer, force_digest=force)
                force = False
        except Exception as exc:
            logger.error("Notification pass failed (%s); retrying", type(exc).__name__)
        if args.once:
            break
        stop.wait(60)


if __name__ == "__main__":
    main()
