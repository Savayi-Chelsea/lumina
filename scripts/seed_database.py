import csv
from collections import defaultdict

import psycopg

from local_database import ROOT, local_dsn
from synthetic_identity import fixture_email, seed_user, validate_fixture_rows

CSV_FILE = ROOT / "data/synthetic_alumni.csv"
WORK_HISTORY_FILE = ROOT / "data/synthetic_work_history.csv"


def to_bool(value: str) -> bool:
    return value.strip().lower() == "true"


def load_work_history():
    history = defaultdict(list)
    if WORK_HISTORY_FILE.exists():
        with WORK_HISTORY_FILE.open(newline="", encoding="utf-8") as csvfile:
            for row in csv.DictReader(csvfile):
                history[row["synthetic_id"]].append(row)
    return history


def main():
    database_url = local_dsn()
    work_history = load_work_history()

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            with CSV_FILE.open(newline="", encoding="utf-8") as csvfile:
                reader = validate_fixture_rows(list(csv.DictReader(csvfile)))

                for row in reader:
                    email = fixture_email(row["synthetic_id"])
                    user_id = seed_user(conn, email)

                    cur.execute(
                        """
                        INSERT INTO profiles (
                            user_id,
                            full_name,
                            headline,
                            biography,
                            former_kq_role,
                            former_kq_department,
                            kq_start_year,
                            kq_end_year,
                            current_job_title,
                            current_organization,
                            industry,
                            location,
                            profile_completed
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, TRUE
                        )
                        ON CONFLICT (user_id)
                        DO UPDATE SET
                            full_name = EXCLUDED.full_name,
                            headline = EXCLUDED.headline,
                            biography = EXCLUDED.biography,
                            former_kq_role = EXCLUDED.former_kq_role,
                            former_kq_department = EXCLUDED.former_kq_department,
                            kq_start_year = EXCLUDED.kq_start_year,
                            kq_end_year = EXCLUDED.kq_end_year,
                            current_job_title = EXCLUDED.current_job_title,
                            current_organization = EXCLUDED.current_organization,
                            industry = EXCLUDED.industry,
                            location = EXCLUDED.location,
                            profile_completed = TRUE
                        RETURNING id;
                        """,
                        (
                            user_id,
                            row["full_name"],
                            row["headline"],
                            row["biography"],
                            row["former_kq_role"],
                            row["former_kq_department"],
                            int(row["kq_start_year"]),
                            int(row["kq_end_year"]),
                            row["current_job_title"],
                            row["current_organization"],
                            row["industry"],
                            row["location"],
                        ),
                    )

                    profile_id = cur.fetchone()[0]

                    skill_names = [
                        skill.strip()
                        for skill in row["skills"].split("|")
                        if skill.strip()
                    ]

                    for skill_name in skill_names:
                        cur.execute(
                            """
                            INSERT INTO skills (name)
                            VALUES (%s)
                            ON CONFLICT (name)
                            DO UPDATE SET name = EXCLUDED.name
                            RETURNING id;
                            """,
                            (skill_name,),
                        )

                        skill_id = cur.fetchone()[0]

                        cur.execute(
                            """
                            INSERT INTO profile_skills (
                                profile_id,
                                skill_id
                            )
                            VALUES (%s, %s)
                            ON CONFLICT DO NOTHING;
                            """,
                            (
                                profile_id,
                                skill_id,
                            ),
                        )

                    cur.execute(
                        """
                        INSERT INTO mentorship_preferences (
                            profile_id,
                            available_for_mentorship,
                            consent_to_matching,
                            mentorship_topics
                        )
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (profile_id)
                        DO UPDATE SET
                            available_for_mentorship =
                                EXCLUDED.available_for_mentorship,
                            consent_to_matching =
                                EXCLUDED.consent_to_matching,
                            mentorship_topics =
                                EXCLUDED.mentorship_topics;
                        """,
                        (
                            profile_id,
                            to_bool(row["available_for_mentorship"]),
                            to_bool(row["consent_to_matching"]),
                            row["mentorship_topics"],
                        ),
                    )

                    # Replace this fixture's work history wholesale so reseeding is idempotent.
                    cur.execute("DELETE FROM work_experience WHERE profile_id = %s", (profile_id,))
                    for entry in work_history[row["synthetic_id"]]:
                        cur.execute(
                            """
                            INSERT INTO work_experience (profile_id, organization, job_title, start_date, end_date, is_current, description)
                            VALUES (%s, %s, %s, make_date(%s, 1, 1), CASE WHEN %s = '' THEN NULL ELSE make_date(%s::int, 12, 31) END, %s, %s)
                            """,
                            (profile_id, entry["organization"], entry["job_title"], int(entry["start_year"]),
                             entry["end_year"], entry["end_year"] or None, to_bool(entry["is_current"]), entry["description"]),
                        )

        conn.commit()

    print("Synthetic alumni data seeded successfully.")


if __name__ == "__main__":
    main()
