"""Seed a separate local evaluation database with the 500-profile evaluation dataset.

  docker exec lumina-postgres createdb -U lumina lumina_eval_500
  docker exec lumina-postgres psql -U lumina -d lumina_eval_500 -q -f /docker-entrypoint-initdb.d/init.sql \
      -f /docker-entrypoint-initdb.d/schema.sql
  DATABASE_URL=postgresql://lumina:<password>@localhost:5432/lumina_eval_500 \
      .venv/bin/python scripts/seed_evaluation_dataset.py

Refuses any database not named lumina_eval_*: the demo database (lumina) keeps its
200 profiles. Profiles are non-login synthetic fixtures with the same e-mail scheme as
the demo (alum-NNN@synthetic.lumina.local). Reseeding replaces the dataset's profile
fields, skills, mentorship preferences and work history, so it is idempotent.
"""
import argparse
import csv
from collections import defaultdict
from pathlib import Path

import psycopg
from psycopg.conninfo import conninfo_to_dict

from local_database import ROOT, is_evaluation_database, local_dsn
from synthetic_identity import FIXTURE_PASSWORD

DATASET = ROOT / "evaluation/datasets/alumni_500"


def read(path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", type=Path, default=DATASET / "synthetic_alumni_500.csv")
    parser.add_argument("--history", type=Path, default=DATASET / "synthetic_work_history_500.csv")
    args = parser.parse_args()
    dsn = local_dsn()
    if not is_evaluation_database(conninfo_to_dict(dsn).get("dbname")):
        raise SystemExit("Refusing: point DATABASE_URL at a local lumina_eval_* database (the demo database is never reseeded here)")
    rows, history = read(args.dataset), defaultdict(list)
    for entry in read(args.history):
        history[entry["synthetic_id"]].append(entry)
    with psycopg.connect(dsn) as conn, conn.transaction():
        for row in rows:
            email = row["synthetic_id"].lower() + "@synthetic.lumina.local"
            user_id = conn.execute("""INSERT INTO users (email, password_hash, role, account_status, email_verified, alumni_verified)
                VALUES (%s, %s, 'alumni', 'active', TRUE, TRUE)
                ON CONFLICT (email) DO UPDATE SET account_status = 'active' RETURNING id""", (email, FIXTURE_PASSWORD)).fetchone()[0]
            profile_id = conn.execute("""INSERT INTO profiles (user_id, full_name, headline, biography, former_kq_role, former_kq_department,
                    kq_start_year, kq_end_year, current_job_title, current_organization, industry, location, profile_completed)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, headline = EXCLUDED.headline,
                    biography = EXCLUDED.biography, former_kq_role = EXCLUDED.former_kq_role,
                    former_kq_department = EXCLUDED.former_kq_department, kq_start_year = EXCLUDED.kq_start_year,
                    kq_end_year = EXCLUDED.kq_end_year, current_job_title = EXCLUDED.current_job_title,
                    current_organization = EXCLUDED.current_organization, industry = EXCLUDED.industry, location = EXCLUDED.location
                RETURNING id""",
                (user_id, row["full_name"], row["headline"], row["biography"], row["former_kq_role"], row["former_kq_department"],
                 int(row["kq_start_year"]), int(row["kq_end_year"]), row["current_job_title"], row["current_organization"],
                 row["industry"], row["location"])).fetchone()[0]
            conn.execute("DELETE FROM profile_skills WHERE profile_id = %s", (profile_id,))
            for name in [s.strip() for s in row["skills"].split("|") if s.strip()]:
                skill_id = conn.execute("INSERT INTO skills (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
                                        (name,)).fetchone()[0]
                conn.execute("INSERT INTO profile_skills (profile_id, skill_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (profile_id, skill_id))
            conn.execute("""INSERT INTO mentorship_preferences (profile_id, available_for_mentorship, consent_to_matching, mentorship_topics)
                VALUES (%s, %s, %s, %s) ON CONFLICT (profile_id) DO UPDATE SET available_for_mentorship = EXCLUDED.available_for_mentorship,
                consent_to_matching = EXCLUDED.consent_to_matching, mentorship_topics = EXCLUDED.mentorship_topics""",
                (profile_id, row["available_for_mentorship"] == "True", row["consent_to_matching"] == "True", row["mentorship_topics"]))
            conn.execute("DELETE FROM work_experience WHERE profile_id = %s", (profile_id,))
            for entry in history[row["synthetic_id"]]:
                conn.execute("""INSERT INTO work_experience (profile_id, organization, job_title, start_date, end_date, is_current, description)
                    VALUES (%s, %s, %s, make_date(%s, 1, 1), CASE WHEN %s = '' THEN NULL ELSE make_date(%s::int, 12, 31) END, %s, %s)""",
                    (profile_id, entry["organization"], entry["job_title"], int(entry["start_year"]), entry["end_year"],
                     entry["end_year"] or None, entry["is_current"] == "True", entry["description"]))
    print(f"Seeded {len(rows)} evaluation profiles into {conninfo_to_dict(dsn).get('dbname')}")


if __name__ == "__main__":
    main()
