"""Give the seeded alumni a realistic connection network (local only).

Each seeded alumnus gets a random number of accepted connections (a few people
are well connected, most have 5-30), drawn mostly from their former department,
then their current industry or city, then anyone. Dates are spread over the
last two years. The random generator is seeded, so reruns rebuild the same
network: connections between two seeded alumni are replaced, and nothing else
is touched.

`--member EMAIL` (repeatable) also connects a real, verified alumni account to
a random set of seeded alumni and leaves it a few pending invitations, with
notifications, so a demo account starts with a lived-in network. Existing
connections of that account are kept.
"""
import argparse
import math
import random
import sys
from datetime import datetime, timedelta, timezone

import psycopg
from local_database import local_dsn

SEED = 20261021
SEEDED = "%@synthetic.lumina.local"
NOW = datetime.now(timezone.utc)


class Preview(Exception):
    """Raised inside the transaction so a preview rolls back everything it wrote."""


def pick_target(rng):
    """Skewed degree: median about 14, occasional hubs up to 60."""
    return max(4, min(60, int(rng.lognormvariate(math.log(14), 0.55))))


def when(rng, max_days=730, min_days=3):
    created = NOW - timedelta(days=rng.uniform(min_days, max_days), minutes=rng.randint(0, 1439))
    return created, created + timedelta(hours=rng.uniform(1, 96))


def build_network(people, rng):
    """people: list of (user_id, department, industry, location). Returns set of sorted pairs."""
    by = {"department": {}, "industry": {}, "location": {}}
    for uid, dept, industry, location in people:
        for key, value in (("department", dept), ("industry", industry), ("location", location)):
            if value:
                by[key].setdefault(value, []).append(uid)
    info = {p[0]: p for p in people}
    target = {p[0]: pick_target(rng) for p in people}
    degree = {p[0]: 0 for p in people}
    edges = set()
    order = [p[0] for p in people]
    rng.shuffle(order)
    for uid in order:
        _, dept, industry, location = info[uid]
        attempts = 0
        while degree[uid] < target[uid] and attempts < 400:
            attempts += 1
            roll = rng.random()
            if roll < 0.55 and dept:
                pool = by["department"][dept]
            elif roll < 0.70 and industry:
                pool = by["industry"][industry]
            elif roll < 0.80 and location:
                pool = by["location"][location]
            else:
                pool = order
            other = rng.choice(pool)
            pair = tuple(sorted((uid, other)))
            if other == uid or pair in edges or degree[other] >= target[other] * 1.5:
                continue
            edges.add(pair)
            degree[uid] += 1
            degree[other] += 1
    return edges


def seed(apply, members, member_connections):
    rng = random.Random(SEED)
    with psycopg.connect(local_dsn()) as conn:
        try:
            with conn.transaction():
                people = conn.execute("""
                    SELECT u.id::text, p.former_kq_department, p.industry, p.location FROM users u JOIN profiles p ON p.user_id = u.id
                    WHERE u.email LIKE %s AND u.role = 'alumni' AND u.account_status = 'active' AND u.alumni_verified
                    ORDER BY u.email""", (SEEDED,)).fetchall()
                if len(people) < 10:
                    raise ValueError("Seed the alumni first (scripts/seed_database.py)")
                edges = build_network(people, rng)
                seeded_ids = [p[0] for p in people]
                removed = conn.execute("""DELETE FROM connections WHERE requester_id = ANY(%s::uuid[]) AND addressee_id = ANY(%s::uuid[])""",
                                       (seeded_ids, seeded_ids)).rowcount
                rows = []
                for a, b in sorted(edges):
                    requester, addressee = (a, b) if rng.random() < 0.5 else (b, a)
                    created, responded = when(rng)
                    rows.append((requester, addressee, created, responded))
                with conn.cursor() as cur:
                    cur.executemany("""INSERT INTO connections (requester_id, addressee_id, status, created_at, responded_at)
                        VALUES (%s, %s, 'accepted', %s, %s)""", rows)

                member_report = []
                for email in members:
                    member = conn.execute("""SELECT u.id::text, p.former_kq_department FROM users u JOIN profiles p ON p.user_id = u.id
                        WHERE lower(u.email) = lower(%s) AND u.role = 'alumni' AND u.account_status = 'active' AND u.alumni_verified""",
                                          (email,)).fetchone()
                    if not member:
                        raise ValueError(f"{email} must be an active, verified alumni account with a profile")
                    member_id, dept = member
                    mrng = random.Random(f"{SEED}:{email.lower()}")
                    same = [p[0] for p in people if dept and p[1] == dept]
                    others = [p[0] for p in people if p[0] not in same]
                    mrng.shuffle(same)
                    mrng.shuffle(others)
                    count = member_connections or mrng.randint(28, 45)
                    chosen = (same[:max(1, count * 2 // 5)] + others)[:count]
                    pending = [p for p in (same + others) if p not in chosen][:3]
                    added = invited = 0
                    for other in chosen + pending:
                        exists = conn.execute("""SELECT 1 FROM connections WHERE LEAST(requester_id, addressee_id) = LEAST(%s::uuid, %s::uuid)
                            AND GREATEST(requester_id, addressee_id) = GREATEST(%s::uuid, %s::uuid)""",
                                              (member_id, other, member_id, other)).fetchone()
                        if exists:
                            continue
                        if other in pending:
                            created = NOW - timedelta(hours=mrng.uniform(2, 120))
                            conn.execute("""INSERT INTO connections (requester_id, addressee_id, status, created_at)
                                VALUES (%s, %s, 'pending', %s)""", (other, member_id, created))
                            conn.execute("""INSERT INTO notifications (user_id, actor_id, kind, link, created_at)
                                VALUES (%s, %s, 'connection_request', '/network/connections', %s)""", (member_id, other, created))
                            invited += 1
                        else:
                            created, responded = when(mrng, max_days=400)
                            requester, addressee = (member_id, other) if mrng.random() < 0.5 else (other, member_id)
                            conn.execute("""INSERT INTO connections (requester_id, addressee_id, status, created_at, responded_at)
                                VALUES (%s, %s, 'accepted', %s, %s)""", (requester, addressee, created, responded))
                            added += 1
                    member_report.append(f"{email}: +{added} connections, +{invited} pending invitations")

                degrees = conn.execute("""SELECT min(n), percentile_cont(0.5) WITHIN GROUP (ORDER BY n), max(n) FROM (
                    SELECT u.id, count(c.id) AS n FROM users u LEFT JOIN connections c
                      ON c.status = 'accepted' AND u.id IN (c.requester_id, c.addressee_id)
                    WHERE u.email LIKE %s GROUP BY u.id) d""", (SEEDED,)).fetchone()
                if not apply:
                    raise Preview
        except Preview:
            pass
    print(f"{'Seeded' if apply else 'Preview (nothing written)'}: {len(edges)} connections among {len(people)} seeded alumni "
          f"(replaced {removed}); per person min {degrees[0]}, median {int(degrees[1])}, max {degrees[2]}")
    for line in member_report:
        print("  " + line)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--member", action="append", default=[], metavar="EMAIL")
    parser.add_argument("--member-connections", type=int, default=0, help="connections per member (default: random 28-45)")
    args = parser.parse_args()
    try:
        seed(args.apply, args.member, args.member_connections)
    except Exception as exc:
        print(f"Connection seed failed ({type(exc).__name__}: {exc}); rolled back", file=sys.stderr)
        sys.exit(1)
