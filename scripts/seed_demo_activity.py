"""Give the demo sign-in accounts a lived-in network (local development database only).

    .venv/bin/python scripts/seed_demo_activity.py --member grace.muthoni@example.com \\
        --mentor martin.gitau@example.com --apply

Create the accounts first with `npm run demo:accounts` (passwords live only in the
gitignored .demo-accounts.json). Without --apply nothing is written.

--member EMAIL (a verified alumni account):
  * accepts the member's own pending connection requests (the other person
    "accepted"), with notifications;
  * adds accepted connections with synthetic alumni (former department first) until
    the member has --connections (default 110);
  * leaves five new incoming connection requests, with notifications;
  * starts eight message threads with connections, three of them unread.

--mentor EMAIL (a verified alumni account) gets a complete mentor profile (only
while the profile is still an unfinished draft, so later edits are kept): skills,
experience, matching consent and availability, queued for re-indexing so it
appears in mentor search. It also gets connections, two synthetic mentees with
accepted mentorships and one pending mentorship request. The member and the
mentor are deliberately not linked, so the request can be shown live.

Everything is fictional and deterministic. Reruns add only what is missing.
"""
import argparse
import random
import sys
from datetime import datetime, timedelta, timezone

import psycopg
from local_database import local_dsn

SEED = 20261121
SYNTHETIC = "%@synthetic.lumina.local"
NOW = datetime.now(timezone.utc)
POLICY_VERSION = "2026-10"


class Preview(Exception):
    """Raised inside the transaction so a preview rolls back everything it wrote."""


MENTOR_PROFILE = {
    "headline": "Principal Cloud Architect · helping engineers grow from IT operations into cloud",
    "biography": (
        "I spent eleven years in Kenya Airways ICT, from the service desk to leading the infrastructure team that moved "
        "reservations, crew and maintenance systems to the cloud. Today I design AWS and Azure platforms for banks, "
        "airlines and logistics companies across East Africa at Savanna Cloud Partners.\n\n"
        "I mentor engineers moving from systems administration into cloud engineering and architecture: choosing "
        "a first certification, building a portfolio with Terraform and Kubernetes, preparing for solutions architect "
        "interviews and stepping up to lead a team for the first time."),
    "former_kq_role": "IT Infrastructure Manager", "former_kq_department": "ICT / Digital",
    "kq_start_year": 2009, "kq_end_year": 2020,
    "current_job_title": "Principal Cloud Architect", "current_organization": "Savanna Cloud Partners",
    "industry": "Technology", "location": "Nairobi",
}
MENTOR_SKILLS = ["AWS", "Azure", "Cloud Architecture", "Cloud Migration", "Kubernetes", "Terraform", "DevOps",
                 "Linux Administration", "IT Infrastructure", "Solutions Architecture", "Team Leadership", "Mentoring"]
MENTOR_TOPICS = ["Moving from systems administration into cloud engineering", "Preparing for AWS and Azure certifications",
                 "Growing into a solutions architect role", "Leading an engineering team for the first time",
                 "Building a technology career after KQ"]
MENTOR_EXPERIENCE = [
    ("Savanna Cloud Partners", "Principal Cloud Architect", "2022-03-01", None, True,
     "Lead architect for cloud platforms in banking, aviation and logistics. Built the landing-zone blueprint used for 30+ migrations."),
    ("Savanna Cloud Partners", "Senior Cloud Engineer", "2020-06-01", "2022-02-28", False,
     "Migrated core workloads for regional clients to AWS and Azure using Terraform and Kubernetes."),
    ("Kenya Airways", "IT Infrastructure Manager", "2015-01-01", "2020-05-31", False,
     "Led the data-centre and cloud infrastructure team; moved reservations and crew systems to a hybrid cloud."),
    ("Kenya Airways", "Systems Administrator", "2009-02-01", "2014-12-31", False,
     "Ran Linux and Windows servers for airport and head-office systems."),
]
MENTEE_GOALS = [
    ("Move from network support into cloud engineering",
     "Hi Martin, I've been doing network support for three years and want to move into cloud. Could you help me plan the next twelve months?"),
    ("Prepare for the AWS Solutions Architect Associate exam",
     "Hello Martin, I'm preparing for the Solutions Architect Associate exam and would value advice on study and hands-on practice."),
    ("Lead a small infrastructure team for the first time",
     "Good afternoon Martin. I was just promoted to lead a team of four engineers and would appreciate guidance from someone who has done it."),
]

# Threads: (who picks the partner, [(sender, text)]), "them" = the connection, "me" = the member.
THREADS = [
    ("ICT / Digital", [
        ("them", "Hi {me}! I saw you're at {my_org} now. Congratulations! How are you finding the move from sysadmin work to cloud?"),
        ("me", "Thanks {first}! Steep learning curve but I'm enjoying it. Most of my week is Terraform and AWS now."),
        ("them", "That's great. If you ever want someone to sanity-check a design, just shout. I did the Solutions Architect Associate last year."),
    ]),
    ("Nairobi", [
        ("them", "Are you going to the Homecoming Sundowner? A few of us from the old team are going."),
        ("me", "I'm planning to! Who else is coming?"),
        ("them", "Half of the old service desk, I think 😄 Let's get a table together."),
        ("me", "Deal. See you there!"),
    ]),
    ("Technology", [
        ("them", "Hi {me}, we're hiring a junior cloud support engineer at {their_org}. Do you know anyone good I could refer?"),
        ("me", "Thanks for thinking of me! I'll ask around. Is it listed anywhere?"),
        ("them", "It's on the Lumina opportunities page as well: Junior Cloud Support Engineer. Applications close in three weeks."),
    ]),
    ("Mombasa", [
        ("me", "{first}! It's been ages. Are you still at the coast?"),
        ("them", "Still in Mombasa! I run operations for a logistics firm now. You?"),
        ("me", "Cloud engineering in Nairobi. Very different from resetting crew passwords at 3am 😅"),
        ("them", "Ha! Those night shifts built character. Let's catch up properly when I'm next in Nairobi."),
    ]),
    ("Ground Operations", [
        ("them", "Hi {me}, I'm trying to move from ground operations into IT support. Would you have 20 minutes for a call some time?"),
        ("me", "Of course, happy to help. Weekday evenings work best for me."),
        ("them", "Thank you so much! Would Thursday at 7pm work?"),
    ]),
    ("Engineering & Maintenance", [
        ("them", "Thank you for the advice on the AWS Cloud Practitioner exam. I passed this morning! 🎉"),
    ]),
    ("Customer Experience", [
        ("me", "Hi {first}, do you still have the notes from the alumni careers evening?"),
        ("them", "Yes! I'll send them over tonight."),
        ("me", "Perfect, thank you!"),
    ]),
    ("", [
        ("them", "Welcome to Lumina, {me}! Great to see more of the old KQ family here."),
        ("me", "Thank you! It's good to be back in touch with everyone."),
    ]),
]
UNREAD_THREADS = {0, 4, 5}  # the last message from "them" is unread


def account(conn, email):
    row = conn.execute("""SELECT u.id::text, p.id::text, p.full_name, p.former_kq_department, p.current_organization, p.profile_completed
        FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE lower(u.email) = lower(%s) AND u.role = 'alumni' AND u.account_status = 'active' AND u.alumni_verified""", (email,)).fetchone()
    if not row:
        raise ValueError(f"{email} must be an active, verified alumni account with a profile (run npm run demo:accounts first)")
    if email.lower().endswith("@synthetic.lumina.local"):
        raise ValueError("demo accounts must not be synthetic fixtures")
    return row


def pair_exists(conn, a, b):
    return conn.execute("""SELECT status FROM connections WHERE LEAST(requester_id, addressee_id) = LEAST(%s::uuid, %s::uuid)
        AND GREATEST(requester_id, addressee_id) = GREATEST(%s::uuid, %s::uuid)""", (a, b, a, b)).fetchone()


def connect(conn, a, b, created, responded, status="accepted"):
    conn.execute("""INSERT INTO connections (requester_id, addressee_id, status, created_at, responded_at) VALUES (%s, %s, %s, %s, %s)""",
                 (a, b, status, created, responded))


def notify(conn, user_id, actor_id, kind, link, created, read):
    conn.execute("""INSERT INTO notifications (user_id, actor_id, kind, link, created_at, read_at) VALUES (%s, %s, %s, %s, %s, %s)""",
                 (user_id, actor_id, kind, link, created, created + timedelta(hours=2) if read else None))


def synthetic_people(conn):
    return conn.execute("""SELECT u.id::text, p.full_name, p.former_kq_department, p.location, p.industry, p.current_organization
        FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.email LIKE %s AND u.role = 'alumni' AND u.account_status = 'active' AND u.alumni_verified AND p.show_in_directory
        ORDER BY u.email""", (SYNTHETIC,)).fetchall()


def seed_member(conn, email, target, exclude):
    rng = random.Random(f"{SEED}:{email.lower()}")
    me, _, my_name, my_dept, my_org, _ = account(conn, email)
    people = [p for p in synthetic_people(conn) if p[0] not in exclude]
    report = {}

    # 1. The member's own outgoing requests are accepted, recently.
    accepted = conn.execute("""UPDATE connections SET status = 'accepted', responded_at = %s - (random() * interval '3 days')
        WHERE requester_id = %s AND status = 'pending' RETURNING addressee_id::text, responded_at""", (NOW, me)).fetchall()
    for i, (other, responded) in enumerate(accepted):
        notify(conn, me, other, "connection_accepted", "/network/connections", responded, read=i >= 5)
    report["requests accepted"] = len(accepted)

    # 2. Accepted connections up to the target, former department first.
    have = conn.execute("""SELECT count(*) FROM connections WHERE status = 'accepted' AND %s IN (requester_id, addressee_id)""", (me,)).fetchone()[0]
    same = [p for p in people if p[2] == my_dept]
    others = [p for p in people if p[2] != my_dept]
    rng.shuffle(same)
    rng.shuffle(others)
    added = 0
    pool = same + others
    for person in pool:
        if have + added >= target:
            break
        if pair_exists(conn, me, person[0]):
            continue
        created = NOW - timedelta(days=rng.uniform(5, 420), minutes=rng.randint(0, 1439))
        a, b = (me, person[0]) if rng.random() < 0.4 else (person[0], me)
        connect(conn, a, b, created, created + timedelta(hours=rng.uniform(1, 72)))
        added += 1
    report["connections added"] = added

    # 3. Up to five incoming requests waiting for an answer.
    waiting = conn.execute("SELECT count(*) FROM connections WHERE addressee_id = %s AND status = 'pending'", (me,)).fetchone()[0]
    invited = 0
    for person in reversed(pool):
        if waiting + invited >= 5:
            break
        if pair_exists(conn, me, person[0]):
            continue
        created = NOW - timedelta(hours=rng.uniform(1, 70))
        connect(conn, person[0], me, created, None, status="pending")
        notify(conn, me, person[0], "connection_request", "/network/connections", created, read=False)
        invited += 1
    report["incoming requests"] = invited

    # 4. Message threads with connections.
    connected = conn.execute("""SELECT CASE WHEN c.requester_id = %s THEN c.addressee_id ELSE c.requester_id END::text
        FROM connections c WHERE c.status = 'accepted' AND %s IN (c.requester_id, c.addressee_id)""", (me, me)).fetchall()
    connected = {row[0] for row in connected}
    candidates = [p for p in people if p[0] in connected]
    rng.shuffle(candidates)
    used, threads = set(), 0
    first_me = my_name.split()[0]
    started = conn.execute("SELECT count(*) FROM conversations WHERE %s IN (user_a, user_b) AND last_message_at IS NOT NULL", (me,)).fetchone()[0]
    for index, (prefer, lines) in enumerate(THREADS):
        if index < started:
            continue  # threads already there (seeded earlier or real) count towards the eight
        person = next((p for p in candidates if p[0] not in used and prefer and prefer in (p[2], p[3], p[4])), None) \
            or next((p for p in candidates if p[0] not in used), None)
        if not person:
            break
        used.add(person[0])
        them = person[0]
        a, b = sorted([me, them])
        existing = conn.execute("SELECT id::text, last_message_at FROM conversations WHERE user_a = %s AND user_b = %s", (a, b)).fetchone()
        if existing and existing[1] is not None:
            continue
        convo = existing[0] if existing else conn.execute(
            "INSERT INTO conversations (user_a, user_b, created_at) VALUES (%s, %s, %s) RETURNING id::text",
            (a, b, NOW - timedelta(days=20))).fetchone()[0]
        unread = index in UNREAD_THREADS
        at = NOW - (timedelta(hours=rng.uniform(1, 30)) if unread else timedelta(days=rng.uniform(2, 14)))
        at -= timedelta(minutes=sum(rng.randint(4, 90) for _ in lines))
        fill = {"me": first_me, "first": person[1].split()[0], "my_org": my_org or "your new company", "their_org": person[5] or "my company"}
        for n, (who, text) in enumerate(lines):
            at += timedelta(minutes=rng.randint(4, 90))
            sender = me if who == "me" else them
            last = n == len(lines) - 1
            read_at = None if (unread and last and who == "them") else at + timedelta(minutes=rng.randint(1, 30))
            conn.execute("INSERT INTO messages (conversation_id, sender_id, body, created_at, read_at) VALUES (%s, %s, %s, %s, %s)",
                         (convo, sender, text.format(**fill), at, read_at))
        conn.execute("UPDATE conversations SET last_message_at = %s WHERE id = %s", (at, convo))
        if unread:
            notify(conn, me, them, "message", f"/messages/{convo}", at, read=False)
        threads += 1
    report["message threads"] = threads
    total = conn.execute("""SELECT count(*) FROM connections WHERE status = 'accepted' AND %s IN (requester_id, addressee_id)""", (me,)).fetchone()[0]
    return me, f"{email}: " + ", ".join(f"{v} {k}" for k, v in report.items()) + f"; now {total} connections"


def seed_mentor(conn, email, member_id):
    rng = random.Random(f"{SEED}:mentor:{email.lower()}")
    me, profile, name, _, _, completed = account(conn, email)
    lines = []
    if not completed:
        values = MENTOR_PROFILE
        conn.execute("""UPDATE profiles SET headline = %(headline)s, biography = %(biography)s, former_kq_role = %(former_kq_role)s,
            former_kq_department = %(former_kq_department)s, kq_start_year = %(kq_start_year)s, kq_end_year = %(kq_end_year)s,
            current_job_title = %(current_job_title)s, current_organization = %(current_organization)s, industry = %(industry)s,
            location = %(location)s, profile_completed = TRUE, open_to_opportunities = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id = %(id)s""", {**values, "id": profile})
        for skill in MENTOR_SKILLS:
            skill_id = conn.execute("""INSERT INTO skills (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id""", (skill,)).fetchone()[0]
            conn.execute("INSERT INTO profile_skills (profile_id, skill_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (profile, skill_id))
        if not conn.execute("SELECT 1 FROM work_experience WHERE profile_id = %s", (profile,)).fetchone():
            for org, title, start, end, current, description in MENTOR_EXPERIENCE:
                conn.execute("""INSERT INTO work_experience (profile_id, organization, job_title, start_date, end_date, is_current, description)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)""", (profile, org, title, start, end, current, description))
        conn.execute("""INSERT INTO mentorship_preferences (profile_id, consent_to_matching, available_for_mentorship, mentorship_topics, maximum_mentees)
            VALUES (%s, TRUE, TRUE, %s, 4) ON CONFLICT (profile_id) DO UPDATE SET consent_to_matching = TRUE, available_for_mentorship = TRUE,
            mentorship_topics = EXCLUDED.mentorship_topics, maximum_mentees = 4, updated_at = CURRENT_TIMESTAMP""", (profile, "|".join(MENTOR_TOPICS)))
        conn.execute("""INSERT INTO privacy_consents (user_id, kind, value, policy_version) VALUES (%s, 'mentor_matching', 'granted', %s)""",
                     (me, POLICY_VERSION))
        conn.execute("INSERT INTO profile_change_outbox (profile_id, reason) VALUES (%s, 'profile')", (profile,))
        lines.append("mentor profile completed and queued for indexing")
    else:
        lines.append("profile already complete, left as it is")

    # Connections with synthetic alumni (ICT first), so the mentor's network is not empty.
    people = synthetic_people(conn)
    same = [p for p in people if p[2] == "ICT / Digital"]
    others = [p for p in people if p[2] != "ICT / Digital"]
    rng.shuffle(same)
    rng.shuffle(others)
    added = 0
    for person in (same + others)[:48]:
        if person[0] == member_id or pair_exists(conn, me, person[0]):
            continue
        created = NOW - timedelta(days=rng.uniform(10, 600))
        connect(conn, person[0], me, created, created + timedelta(hours=rng.uniform(1, 48)))
        added += 1
    lines.append(f"{added} connections added")

    # Two accepted mentorships and one pending request from synthetic mentees.
    existing = conn.execute("SELECT count(*) FROM mentorship_requests WHERE mentor_id = %s", (me,)).fetchone()[0]
    if existing == 0:
        mentees = [p for p in same + others if p[0] != member_id][-3:]
        for i, (person, (goal, message)) in enumerate(zip(mentees, MENTEE_GOALS)):
            created = NOW - timedelta(days=[40, 18, 0.3][i])
            status = "pending" if i == 2 else "accepted"
            conn.execute("""INSERT INTO mentorship_requests (mentee_id, mentor_id, goal, message, status, created_at, responded_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)""", (person[0], me, goal, message, status, created,
                                                       None if status == "pending" else created + timedelta(hours=20)))
            notify(conn, me, person[0], "mentorship_request", "/mentorship/requests", created, read=status != "pending")
        lines.append("2 accepted mentorships and 1 pending request")
    else:
        lines.append(f"{existing} mentorship requests already, left as they are")
    return f"{email}: " + ", ".join(lines)


def seed(apply, member, mentor, target):
    with psycopg.connect(local_dsn()) as conn:
        database = conn.execute("SELECT current_database()").fetchone()[0]
        if database != "lumina":
            raise ValueError("demo activity is only seeded into the local lumina database")
        report = []
        try:
            with conn.transaction():
                mentor_id = account(conn, mentor)[0] if mentor else None
                member_id = None
                if member:
                    member_id, line = seed_member(conn, member, target, {mentor_id} if mentor_id else set())
                    report.append(line)
                if mentor:
                    report.append(seed_mentor(conn, mentor, member_id))
                if not apply:
                    raise Preview
        except Preview:
            pass
    print("Seeded:" if apply else "Preview (nothing written):")
    for line in report:
        print("  " + line)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--member", metavar="EMAIL")
    parser.add_argument("--mentor", metavar="EMAIL")
    parser.add_argument("--connections", type=int, default=110, help="accepted connections for the member (default 110)")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.member and not args.mentor:
        parser.error("give --member and/or --mentor")
    try:
        seed(args.apply, args.member, args.mentor, args.connections)
    except Exception as exc:
        print(f"Demo activity seed failed ({type(exc).__name__}: {exc}); rolled back", file=sys.stderr)
        sys.exit(1)
