"""Seed accepted mentorships, their conversations, session recaps and reactions (local only).

Seeded alumni get about 48 accepted mentorships with a mentor who offers
mentorship, an opening conversation, 1-2 past sessions with a published
recap each, and a spread of "Insightful" reactions. Rows use fixed UUIDs, so reruns replace
exactly what this script created and touch nothing else.

`--member EMAIL` gives a real, verified account a mentor from the seeded
alumni (preferably from the same former department), a short conversation,
one published recap, one recap waiting for that member's approval, and four
open session times next week that the member can book.
"""
import argparse
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

import psycopg
from local_database import local_dsn

SEED = 20261022
NAMESPACE = uuid.UUID("2b7c6f0e-9a51-4d3c-8f2e-5a1d7c3b9e40")
SEEDED = "%@synthetic.lumina.local"
NOW = datetime.now(timezone.utc)
MENTORSHIPS = 48

ANGLES = ["first steps", "a 90-day plan", "building a portfolio", "preparing for interviews", "certifications that matter",
          "managing the transition", "finding the right role", "growing as a leader", "learning on the job", "networking with intent"]
TAKEAWAYS = [
    "We mapped {mentee}'s experience at Kenya Airways onto {topic_l} roles and found more overlap than expected. Next steps: rewrite the CV summary around outcomes, and shortlist three organisations to approach this month.",
    "{mentor} shared how they moved into {org} and what the first year looked like. The biggest lesson: start with one small, visible project and ask for feedback early. We agreed to check in again in four weeks.",
    "We worked through a realistic plan for {topic_l}: one course, one hands-on project and one conversation with someone already in the field each month. {mentee} left with a clear first milestone.",
    "Most of the session was practice interview questions. {mentor} suggested using the STAR format with examples from operations work, which made the answers much sharper. Mock interview number two is booked.",
    "We talked about confidence after a long career in one organisation. Useful reframe: aviation discipline, safety culture and working under pressure are strengths employers look for. {mentee} will lead with them.",
    "{mentor} reviewed {mentee}'s LinkedIn profile and CV line by line. Key changes: a sharper headline, numbers in every role, and a short projects section. Both documents get a second pass before applications go out.",
    "We compared two possible paths and listed the trade-offs of each: salary, learning curve and long-term growth. {mentee} chose to explore {topic_l} first, with a three-month check point.",
    "A practical session on {skill}. {mentor} walked through how it is used day to day at {org} and pointed to free resources to practise with. {mentee} will share a small piece of work for review.",
]
OPENERS = [
    ("mentor", "Happy to help, {mentee_first}. Shall we start with a 45-minute call next week?"),
    ("mentee", "Thank you! Tuesday evening works for me, around 7pm?"),
    ("mentor", "Tuesday at 7 is perfect. Bring your current CV and a short list of roles you're curious about."),
]


def fixed_id(*parts):
    return uuid.uuid5(NAMESPACE, ":".join(str(part) for part in parts))


def recap_text(rng, mentor, mentee, topic):
    skill = rng.choice(mentor["skills"]) if mentor["skills"] else topic
    return rng.choice(TAKEAWAYS).format(mentor=mentor["first"], mentee=mentee["first"], topic_l=topic.lower(),
                                        org=mentor["org"] or "their organisation", skill=skill)


def people(conn):
    rows = conn.execute("""
        SELECT u.id::text, u.email, p.full_name, p.former_kq_department, p.current_organization,
               m.consent_to_matching AND m.available_for_mentorship, coalesce(m.mentorship_topics, ''),
               coalesce((SELECT array_agg(s.name ORDER BY s.name) FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.profile_id = p.id), '{}')
        FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN mentorship_preferences m ON m.profile_id = p.id
        WHERE u.role = 'alumni' AND u.account_status = 'active' AND u.alumni_verified AND u.email LIKE %s ORDER BY u.email""", (SEEDED,)).fetchall()
    return [{"id": r[0], "email": r[1], "name": r[2], "first": r[2].split()[0], "dept": r[3], "org": r[4], "mentor": bool(r[5]),
             "topics": [t.strip() for t in r[6].split("|") if t.strip()], "skills": list(r[7])} for r in rows]


def insert_mentorship(conn, mid, mentor, mentee, goal, message, created, responded):
    conn.execute("""INSERT INTO mentorship_requests (id, mentee_id, mentor_id, goal, message, status, created_at, responded_at)
        VALUES (%s, %s, %s, %s, %s, 'accepted', %s, %s)""", (mid, mentee["id"], mentor["id"], goal, message, created, responded))


def insert_conversation(conn, cid, mentor, mentee, goal, message, start, unread_last=False):
    a, b = sorted((mentor["id"], mentee["id"]))
    existing = conn.execute("SELECT id FROM conversations WHERE user_a = %s AND user_b = %s", (a, b)).fetchone()
    if existing:
        return existing[0]
    lines = [(mentee, f"Mentorship request: {goal}\n\n{message}")] + [
        (mentor if who == "mentor" else mentee, text.format(mentee_first=mentee["first"])) for who, text in OPENERS]
    times = [start + timedelta(minutes=5 + 90 * i) for i in range(len(lines))]
    conn.execute("INSERT INTO conversations (id, user_a, user_b, created_at, last_message_at) VALUES (%s, %s, %s, %s, %s)",
                 (cid, a, b, start, times[-1]))
    for index, ((sender, body), sent) in enumerate(zip(lines, times)):
        read = None if (unread_last and index == len(lines) - 1) else sent + timedelta(minutes=30)
        conn.execute("INSERT INTO messages (conversation_id, sender_id, body, created_at, read_at) VALUES (%s, %s, %s, %s, %s)",
                     (cid, sender["id"], body, sent, read))
    return cid


def insert_session(conn, rid, mid, mentor_id, session_day, agenda):
    """The (past) booked session a recap describes: 18:00-19:00 Nairobi time on the recap's date."""
    start = datetime.combine(session_day, datetime.min.time(), timezone.utc) + timedelta(hours=15)
    conn.execute("""INSERT INTO mentor_availability (id, mentor_id, starts_at, ends_at, mode, status, created_at)
        VALUES (%s, %s, %s, %s, 'video', 'booked', %s)""", (fixed_id("slot", rid), mentor_id, start, start + timedelta(hours=1), start - timedelta(days=6)))
    conn.execute("""INSERT INTO mentorship_sessions (id, slot_id, mentorship_id, agenda, status, reminder_sent_at, created_at, updated_at)
        VALUES (%s, %s, %s, %s, 'booked', %s, %s, %s)""",
                 (fixed_id("session", rid), fixed_id("slot", rid), mid, agenda, start - timedelta(hours=20), start - timedelta(days=5), start - timedelta(days=5)))


def insert_recap(conn, rid, mid, author, partner, topic, text, session_day, decided, status="published", mentor_id=None):
    if mentor_id:
        insert_session(conn, rid, mid, mentor_id, session_day, topic)
    conn.execute("""INSERT INTO session_recaps (id, mentorship_id, author_id, partner_id, topic, session_date, takeaways, status, created_at, decided_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                 (rid, mid, author["id"], partner["id"], topic, session_day, text, status,
                  datetime.combine(session_day, datetime.min.time(), timezone.utc) + timedelta(hours=20), decided))


def seed(apply, members):
    rng = random.Random(SEED)
    summary = []
    with psycopg.connect(local_dsn()) as conn:
        everyone = people(conn)
        mentors = [p for p in everyone if p["mentor"] and p["topics"]]
        if len(mentors) < 10:
            raise ValueError("Seed alumni and mentorship preferences first (scripts/seed_database.py)")
        connected = {tuple(sorted(row)) for row in conn.execute(
            "SELECT requester_id::text, addressee_id::text FROM connections WHERE status = 'accepted'").fetchall()}
        with conn.transaction():
            # Remove only what this script created before (fixed ids), then rebuild.
            ids = [fixed_id("mentorship", i) for i in range(MENTORSHIPS)] + [fixed_id("member-mentorship", m.lower()) for m in members]
            conv = [fixed_id("conversation", i) for i in range(MENTORSHIPS)] + [fixed_id("member-conversation", m.lower()) for m in members]
            recap_ids = [fixed_id("recap", i, n) for i in range(MENTORSHIPS) for n in (0, 1)] + [
                fixed_id("member-recap", m.lower(), n) for m in members for n in (0, 1)]
            slot_ids = [fixed_id("slot", r) for r in recap_ids] + [fixed_id("member-open-slot", m.lower(), n) for m in members for n in range(4)]
            conn.execute("DELETE FROM mentor_availability WHERE id = ANY(%s)", (slot_ids,))  # cascades to their sessions
            conn.execute("DELETE FROM conversations WHERE id = ANY(%s)", (conv,))
            conn.execute("DELETE FROM mentorship_requests WHERE id = ANY(%s)", (ids,))

            pairs, recaps = set(), []
            for i in range(MENTORSHIPS):
                for _ in range(200):
                    mentor = rng.choice(mentors)
                    pool = [p for p in everyone if p["id"] != mentor["id"] and (tuple(sorted((p["id"], mentor["id"]))) in connected or p["dept"] == mentor["dept"])]
                    mentee = rng.choice(pool or everyone)
                    if mentee["id"] != mentor["id"] and (mentor["id"], mentee["id"]) not in pairs:
                        break
                pairs.add((mentor["id"], mentee["id"]))
                topic = rng.choice(mentor["topics"])
                goal = f"Guidance on {topic.lower()}"
                message = (f"Hi {mentor['first']}, I'm {mentee['first']}. I'd value your perspective on {topic.lower()}, "
                           f"especially how you made your own move after Kenya Airways.")
                created = NOW - timedelta(days=rng.uniform(60, 320))
                responded = created + timedelta(hours=rng.uniform(4, 72))
                mid = fixed_id("mentorship", i)
                insert_mentorship(conn, mid, mentor, mentee, goal, message, created, responded)
                insert_conversation(conn, fixed_id("conversation", i), mentor, mentee, goal, message, responded)
                for n in range(1 if rng.random() < 0.7 else 2):
                    session_day = (responded + timedelta(days=rng.uniform(5, 40) + n * 30)).date()
                    if session_day >= NOW.date():
                        continue
                    decided = datetime.combine(session_day, datetime.min.time(), timezone.utc) + timedelta(days=rng.uniform(1, 3))
                    author, partner = (mentor, mentee) if rng.random() < 0.5 else (mentee, mentor)
                    rid = fixed_id("recap", i, n)
                    insert_recap(conn, rid, mid, author, partner, f"{topic}: {rng.choice(ANGLES)}", recap_text(rng, mentor, mentee, topic), session_day, decided,
                                 mentor_id=mentor["id"])
                    recaps.append((rid, {mentor["id"], mentee["id"]}, decided))
            reactions = 0
            for rid, participants, decided in recaps:
                for reader in rng.sample(everyone, rng.randint(0, 22)):
                    if reader["id"] not in participants:
                        conn.execute("INSERT INTO recap_reactions (recap_id, user_id, created_at) VALUES (%s, %s, %s)",
                                     (rid, reader["id"], decided + timedelta(hours=rng.uniform(1, 200))))
                        reactions += 1
            summary.append(f"{MENTORSHIPS} accepted mentorships, {len(recaps)} published recaps, {reactions} reactions")

            for email in members:
                row = conn.execute("""SELECT u.id::text, p.full_name, p.former_kq_department FROM users u JOIN profiles p ON p.user_id = u.id
                    WHERE lower(u.email) = lower(%s) AND u.role = 'alumni' AND u.account_status = 'active' AND u.alumni_verified""", (email,)).fetchone()
                if not row:
                    raise ValueError(f"{email} must be an active, verified alumni account with a profile")
                member = {"id": row[0], "name": row[1], "first": row[1].split()[0], "dept": row[2]}
                mrng = random.Random(f"{SEED}:{email.lower()}")
                candidates = [m for m in mentors if m["dept"] == member["dept"]] or mentors
                mentor = mrng.choice(candidates)
                if conn.execute("SELECT 1 FROM mentorship_requests WHERE mentee_id = %s AND mentor_id = %s AND status IN ('pending', 'accepted')",
                                (member["id"], mentor["id"])).fetchone():
                    summary.append(f"{email}: already has a mentorship with {mentor['name']}; unchanged")
                    continue
                topic = mrng.choice(mentor["topics"])
                goal = f"Guidance on {topic.lower()}"
                message = f"Hi {mentor['first']}, I'd love your advice on {topic.lower()} as I plan my next step."
                created = NOW - timedelta(days=40)
                responded = created + timedelta(hours=20)
                mid = fixed_id("member-mentorship", email.lower())
                insert_mentorship(conn, mid, mentor, member, goal, message, created, responded)
                cid = insert_conversation(conn, fixed_id("member-conversation", email.lower()), mentor, member, goal, message,
                                          NOW - timedelta(hours=30), unread_last=True)
                conn.execute("DELETE FROM notifications WHERE user_id = %s AND actor_id = %s AND kind IN ('mentorship_accepted', 'message', 'connection_request')",
                             (member["id"], mentor["id"]))
                # A mentor and mentee who have been meeting are connected.
                conn.execute("""DELETE FROM connections WHERE LEAST(requester_id, addressee_id) = LEAST(%s::uuid, %s::uuid)
                    AND GREATEST(requester_id, addressee_id) = GREATEST(%s::uuid, %s::uuid)""", (member["id"], mentor["id"], member["id"], mentor["id"]))
                conn.execute("""INSERT INTO connections (requester_id, addressee_id, status, created_at, responded_at)
                    VALUES (%s, %s, 'accepted', %s, %s)""", (mentor["id"], member["id"], responded, responded + timedelta(hours=2)))
                conn.execute("""INSERT INTO notifications (user_id, actor_id, kind, link, created_at, read_at)
                    VALUES (%s, %s, 'mentorship_accepted', %s, %s, %s)""", (member["id"], mentor["id"], f"/messages/{cid}", responded, responded + timedelta(hours=1)))
                conn.execute("""INSERT INTO notifications (user_id, actor_id, kind, link, created_at)
                    VALUES (%s, %s, 'message', %s, %s)""", (member["id"], mentor["id"], f"/messages/{cid}", NOW - timedelta(hours=25)))
                first_day = (NOW - timedelta(days=24)).date()
                insert_recap(conn, fixed_id("member-recap", email.lower(), 0), mid, member, mentor, f"{topic}: {mrng.choice(ANGLES)}",
                             recap_text(mrng, mentor, member, topic), first_day,
                             datetime.combine(first_day, datetime.min.time(), timezone.utc) + timedelta(days=1), mentor_id=mentor["id"])
                second_day = (NOW - timedelta(days=3)).date()
                insert_recap(conn, fixed_id("member-recap", email.lower(), 1), mid, mentor, member, f"{topic}: {mrng.choice(ANGLES)}",
                             recap_text(mrng, mentor, member, topic), second_day, None, status="pending", mentor_id=mentor["id"])
                # Open times next week so the member can book a session in a demo.
                for n, days in enumerate((2, 4, 6, 9)):
                    start = datetime.combine((NOW + timedelta(days=days)).date(), datetime.min.time(), timezone.utc) + timedelta(hours=15 if n % 2 else 6)
                    conn.execute("""INSERT INTO mentor_availability (id, mentor_id, starts_at, ends_at, mode, details) VALUES (%s, %s, %s, %s, %s, %s)""",
                                 (fixed_id("member-open-slot", email.lower(), n), mentor["id"], start, start + timedelta(minutes=45),
                                  "video" if n % 2 else "phone", "https://meet.example.test/lumina-mentoring" if n % 2 else None))
                summary.append(f"{email}: mentor {mentor['name']}, 2 past sessions, 1 published recap, 1 recap awaiting approval, 1 unread message, 4 open times to book")
            if not apply:
                raise Preview
    for line in summary:
        print(("Seeded: " if apply else "") + line)


class Preview(Exception):
    """Raised inside the transaction so a preview rolls back everything it wrote."""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--member", action="append", default=[], metavar="EMAIL")
    args = parser.parse_args()
    try:
        seed(args.apply, args.member)
    except Preview:
        print("Preview only: rerun with --apply to write (nothing was changed)")
    except Exception as exc:
        print(f"Recap seed failed ({type(exc).__name__}: {exc}); rolled back", file=sys.stderr)
        sys.exit(1)
