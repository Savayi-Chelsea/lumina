"""Session reminders, weekly digests and search-log retention, on temporary copies of the live tables."""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from local_database import local_dsn  # noqa: E402
from run_notifications import digest_week, purge_search_logs, send_digests, send_reminders  # noqa: E402

TABLES = ["users", "profiles", "mentorship_requests", "mentor_availability", "mentorship_sessions", "email_preferences", "email_deliveries",
          "connections", "conversations", "messages", "session_recaps", "events", "mentor_search_events"]


class FakeMailer:
    origin = "http://lumina.test"

    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    def send(self, to, subject, lines):
        if self.fail:
            raise OSError("SMTP down")
        self.sent.append((to, subject, "\n".join(lines)))


@unittest.skipUnless(os.getenv("LUMINA_TEST_DATABASE") == "1", "set LUMINA_TEST_DATABASE=1")
class NotificationWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = psycopg.connect(local_dsn(), autocommit=True, row_factory=dict_row)
        cls.before = cls.counts()
        for table in TABLES:
            cls.conn.execute(f"CREATE TEMP TABLE {table} (LIKE public.{table} INCLUDING ALL)")

    @classmethod
    def counts(cls):
        return {t: cls.conn.execute(f"SELECT count(*) AS n FROM public.{t}").fetchone()["n"] for t in TABLES}

    @classmethod
    def tearDownClass(cls):
        try:
            assert cls.counts() == cls.before, "public tables changed"
        finally:
            cls.conn.close()

    def setUp(self):
        for table in reversed(TABLES):
            self.conn.execute(f"DELETE FROM pg_temp.{table}")
        self.ids = {}
        for key in ("mentor", "mentee", "seeded"):
            email = "alum-999@synthetic.lumina.local" if key == "seeded" else f"{key}@example.test"
            self.ids[key] = self.conn.execute("INSERT INTO users (email, role, account_status, alumni_verified) VALUES (%s, 'alumni', 'active', TRUE) RETURNING id",
                                              (email,)).fetchone()["id"]
            self.conn.execute("INSERT INTO profiles (user_id, full_name) VALUES (%s, %s)", (self.ids[key], key.title() + " Person"))
        self.mentorship = self.conn.execute("""INSERT INTO mentorship_requests (mentee_id, mentor_id, goal, message, status)
            VALUES (%s, %s, 'Cloud careers', 'Hi', 'accepted') RETURNING id""", (self.ids["mentee"], self.ids["mentor"])).fetchone()["id"]
        self.now = datetime(2026, 10, 26, 5, 0, tzinfo=timezone.utc)  # Monday 08:00 in Nairobi

    def book(self, starts_in_hours):
        start = self.now + timedelta(hours=starts_in_hours)
        slot = self.conn.execute("""INSERT INTO mentor_availability (mentor_id, starts_at, ends_at, mode, status)
            VALUES (%s, %s, %s, 'video', 'booked') RETURNING id""", (self.ids["mentor"], start, start + timedelta(hours=1))).fetchone()["id"]
        return self.conn.execute("INSERT INTO mentorship_sessions (slot_id, mentorship_id, agenda) VALUES (%s, %s, 'CV review') RETURNING id",
                                 (slot, self.mentorship)).fetchone()["id"]

    def test_reminders_go_once_to_both_people_within_24_hours(self):
        soon, later = self.book(3), self.book(30)
        mailer = FakeMailer()
        self.assertEqual(send_reminders(self.conn, mailer, now=self.now), 2)
        self.assertEqual(sorted(m[0] for m in mailer.sent), ["mentee@example.test", "mentor@example.test"])
        self.assertIn("CV review", mailer.sent[0][2])
        self.assertEqual(send_reminders(self.conn, mailer, now=self.now), 0)
        self.assertIsNotNone(self.conn.execute("SELECT reminder_sent_at FROM mentorship_sessions WHERE id = %s", (soon,)).fetchone()["reminder_sent_at"])
        self.assertIsNone(self.conn.execute("SELECT reminder_sent_at FROM mentorship_sessions WHERE id = %s", (later,)).fetchone()["reminder_sent_at"])

    def test_reminders_respect_the_session_email_choice_and_retry_after_failure(self):
        self.conn.execute("INSERT INTO email_preferences (user_id, session_emails) VALUES (%s, FALSE)", (self.ids["mentor"],))
        self.book(2)
        failing = FakeMailer(fail=True)
        send_reminders(self.conn, failing, now=self.now)
        self.assertEqual(self.conn.execute("SELECT count(*) AS n FROM email_deliveries").fetchone()["n"], 0)  # claim released on failure
        self.assertIsNone(self.conn.execute("SELECT reminder_sent_at FROM mentorship_sessions").fetchone()["reminder_sent_at"])

        mailer = FakeMailer()  # The next pass retries, and only the mentee wants session emails.
        self.assertEqual(send_reminders(self.conn, mailer, now=self.now), 1)
        self.assertEqual([m[0] for m in mailer.sent], ["mentee@example.test"])
        self.assertEqual(send_reminders(self.conn, mailer, now=self.now), 0)

    def test_weekly_digest_is_opt_in_once_per_week_and_only_on_monday_morning(self):
        self.conn.execute("INSERT INTO connections (requester_id, addressee_id, status) VALUES (%s, %s, 'pending')", (self.ids["seeded"], self.ids["mentee"]))
        self.book(48)
        mailer = FakeMailer()
        self.assertEqual(send_digests(self.conn, mailer, now=self.now), 0)  # nobody opted in
        self.conn.execute("INSERT INTO email_preferences (user_id, weekly_digest) VALUES (%s, TRUE), (%s, TRUE)", (self.ids["mentee"], self.ids["seeded"]))
        self.assertEqual(send_digests(self.conn, mailer, now=self.now + timedelta(days=1)), 0)  # Tuesday
        self.assertEqual(send_digests(self.conn, mailer, now=self.now), 1)  # the seeded profile can't receive mail
        to, subject, body = mailer.sent[0]
        self.assertEqual((to, subject), ("mentee@example.test", "Your week on Lumina"))
        self.assertIn("1 connection invitation", body)
        self.assertIn("Session with Mentor Person", body)
        self.assertIn("/account/privacy", body)
        self.assertEqual(send_digests(self.conn, mailer, now=self.now + timedelta(hours=2)), 0)  # once per week
        self.assertEqual(send_digests(self.conn, mailer, now=self.now + timedelta(days=7), force=True), 1)
        self.assertEqual(digest_week(self.now), "2026-W44")

    def test_search_logs_are_deleted_after_180_days(self):
        for days in (10, 179, 181, 400):
            self.conn.execute("INSERT INTO mentor_search_events (searcher_id, source, result_count, created_at) VALUES (%s, 'search', 0, CURRENT_TIMESTAMP - make_interval(days => %s))",
                              (self.ids["mentee"], days))
        self.assertEqual(purge_search_logs(self.conn), 2)
        self.assertEqual(self.conn.execute("SELECT count(*) AS n FROM mentor_search_events").fetchone()["n"], 2)


if __name__ == "__main__":
    unittest.main()
