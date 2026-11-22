"""Add the 300 extra synthetic alumni (ALUM-201..ALUM-500) to the demo database.

    .venv/bin/python scripts/extend_demo_alumni.py            # preview, nothing written
    .venv/bin/python scripts/extend_demo_alumni.py --apply
    .venv/bin/python scripts/index_profile_embeddings.py      # embeddings for mentor search
    .venv/bin/python scripts/generate_avatars.py --apply      # portraits and covers

The profiles come from the 500-profile evaluation dataset
(evaluation/datasets/alumni_500), whose first 200 rows are the existing demo
alumni, so the site and the 500-profile evaluation describe the same people.
Like the first 200, they are fictional, non-login fixtures
(alum-NNN@synthetic.lumina.local).

Additive and safe to rerun: people who already exist are skipped and never
changed; existing members, real accounts and their relationships are not
modified. Each new person gets accepted connections (median about 14, mostly
within their former department, then industry and city) with other seeded
alumni; an existing person receives at most MAX_NEW_FOR_EXISTING of them.

Note: the Chapter 4 200-profile results were measured on a 200-profile database.
To reproduce them, use a fresh setup (scripts/setup.sh seeds 200) rather than a
database extended with this script.
"""
import argparse
import csv
import random
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.conninfo import conninfo_to_dict

from local_database import ROOT, is_evaluation_database, local_dsn
from seed_connections import pick_target
from synthetic_identity import FIXTURE_PASSWORD

DATASET = ROOT / "evaluation/datasets/alumni_500"
FIRST_NEW = 201
SEED = 20261122
MAX_NEW_FOR_EXISTING = 12
NOW = datetime.now(timezone.utc)


class Preview(Exception):
    """Raised inside the transaction so a preview rolls back everything it wrote."""


def read(name):
    with (DATASET / name).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def insert_person(conn, row, history):
    email = row["synthetic_id"].lower() + "@synthetic.lumina.local"
    user_id = conn.execute("""INSERT INTO users (email, password_hash, role, account_status, email_verified, alumni_verified)
        VALUES (%s, %s, 'alumni', 'active', TRUE, TRUE) ON CONFLICT (email) DO NOTHING RETURNING id::text""",
                           (email, FIXTURE_PASSWORD)).fetchone()
    if not user_id:
        return None
    user_id = user_id[0]
    profile_id = conn.execute("""INSERT INTO profiles (user_id, full_name, headline, biography, former_kq_role, former_kq_department,
            kq_start_year, kq_end_year, current_job_title, current_organization, industry, location, profile_completed)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE) RETURNING id""",
        (user_id, row["full_name"], row["headline"], row["biography"], row["former_kq_role"], row["former_kq_department"],
         int(row["kq_start_year"]), int(row["kq_end_year"]), row["current_job_title"], row["current_organization"],
         row["industry"], row["location"])).fetchone()[0]
    for name in dict.fromkeys(s.strip() for s in row["skills"].split("|") if s.strip()):
        skill_id = conn.execute("INSERT INTO skills (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
                                (name,)).fetchone()[0]
        conn.execute("INSERT INTO profile_skills (profile_id, skill_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (profile_id, skill_id))
    conn.execute("""INSERT INTO mentorship_preferences (profile_id, available_for_mentorship, consent_to_matching, mentorship_topics)
        VALUES (%s, %s, %s, %s)""", (profile_id, row["available_for_mentorship"] == "True", row["consent_to_matching"] == "True",
                                      row["mentorship_topics"] or None))
    for entry in history:
        conn.execute("""INSERT INTO work_experience (profile_id, organization, job_title, start_date, end_date, is_current, description)
            VALUES (%s, %s, %s, make_date(%s, 1, 1), CASE WHEN %s = '' THEN NULL ELSE make_date(%s::int, 12, 31) END, %s, %s)""",
            (profile_id, entry["organization"], entry["job_title"], int(entry["start_year"]), entry["end_year"],
             entry["end_year"] or None, entry["is_current"] == "True", entry["description"]))
    return user_id


def connect_new_people(conn, new_ids, rng):
    """Accepted connections for newly added people; returns the number created."""
    people = conn.execute("""SELECT u.id::text, p.former_kq_department, p.industry, p.location FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.email LIKE '%%@synthetic.lumina.local' AND u.account_status = 'active' AND u.alumni_verified ORDER BY u.email""").fetchall()
    info = {p[0]: p for p in people}
    pools = defaultdict(list)
    for uid, dept, industry, location in people:
        for key, value in (("department", dept), ("industry", industry), ("location", location)):
            if value:
                pools[(key, value)].append(uid)
    everyone = [p[0] for p in people]
    new = set(new_ids)
    existing_pairs = {tuple(sorted(row)) for row in conn.execute(
        "SELECT requester_id::text, addressee_id::text FROM connections WHERE requester_id = ANY(%s::uuid[]) OR addressee_id = ANY(%s::uuid[])",
        (everyone, everyone)).fetchall()}
    added_to_existing = defaultdict(int)
    rows = []
    for uid in new_ids:
        _, dept, industry, location = info[uid]
        target, made, attempts = pick_target(rng), 0, 0
        while made < target and attempts < 400:
            attempts += 1
            roll = rng.random()
            pool = (pools[("department", dept)] if roll < 0.55 and dept else
                    pools[("industry", industry)] if roll < 0.70 and industry else
                    pools[("location", location)] if roll < 0.80 and location else everyone)
            other = rng.choice(pool)
            pair = tuple(sorted((uid, other)))
            if other == uid or pair in existing_pairs:
                continue
            if other not in new and added_to_existing[other] >= MAX_NEW_FOR_EXISTING:
                continue
            existing_pairs.add(pair)
            if other not in new:
                added_to_existing[other] += 1
            created = NOW - timedelta(days=rng.uniform(3, 730), minutes=rng.randint(0, 1439))
            requester, addressee = (uid, other) if rng.random() < 0.5 else (other, uid)
            rows.append((requester, addressee, created, created + timedelta(hours=rng.uniform(1, 96))))
            made += 1
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO connections (requester_id, addressee_id, status, created_at, responded_at)
            VALUES (%s, %s, 'accepted', %s, %s)""", rows)
    return len(rows)


def run(apply):
    dsn = local_dsn()
    database = conninfo_to_dict(dsn).get("dbname")
    if is_evaluation_database(database):
        raise ValueError(f"{database} is an evaluation database; it already holds the 500-profile dataset")
    rows = [row for row in read("synthetic_alumni_500.csv") if int(row["synthetic_id"].split("-")[1]) >= FIRST_NEW]
    history = defaultdict(list)
    for entry in read("synthetic_work_history_500.csv"):
        history[entry["synthetic_id"]].append(entry)
    rng = random.Random(SEED)
    with psycopg.connect(dsn) as conn:
        base = conn.execute("SELECT count(*) FROM users WHERE email LIKE '%%@synthetic.lumina.local'").fetchone()[0]
        if base < FIRST_NEW - 1:
            raise ValueError(f"Expected the 200 demo alumni first (found {base}); run the normal setup before extending")
        try:
            with conn.transaction():
                new_ids = [uid for uid in (insert_person(conn, row, history[row["synthetic_id"]]) for row in rows) if uid]
                connections = connect_new_people(conn, new_ids, rng) if new_ids else 0
                total = conn.execute("SELECT count(*) FROM users WHERE email LIKE '%%@synthetic.lumina.local'").fetchone()[0]
                if not apply:
                    raise Preview
        except Preview:
            pass
    print(f"{'Added' if apply else 'Preview (nothing written): would add'} {len(new_ids)} alumni "
          f"({len(rows) - len(new_ids)} already present) and {connections} connections to {database}; "
          f"{'now' if apply else 'would then have'} {total} seeded alumni")
    if apply and new_ids:
        print("Next: scripts/index_profile_embeddings.py (mentor search) and scripts/generate_avatars.py --apply (portraits)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    try:
        run(parser.parse_args().apply)
    except Exception as exc:
        print(f"Extending the demo alumni failed ({type(exc).__name__}: {exc}); rolled back", file=sys.stderr)
        sys.exit(1)
