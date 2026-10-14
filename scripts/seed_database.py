import csv
import os
from pathlib import Path

import psycopg

CSV_FILE = Path("data") / "synthetic_alumni.csv"


def to_bool(value: str) -> bool:
    return value.strip().lower() == "true"


def main():
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://lumina:lumina_dev_password@localhost:5432/lumina",
    )

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            with CSV_FILE.open(newline="", encoding="utf-8") as csvfile:
                reader = csv.DictReader(csvfile)

                for row in reader:
                    email = (
                        row["synthetic_id"].lower()
                        + "@synthetic.lumina.local"
                    )

                    cur.execute(
                        """
                        INSERT INTO users (
                            email,
                            password_hash,
                            role,
                            account_status,
                            email_verified
                        )
                        VALUES (%s, %s, 'alumni', 'active', TRUE)
                        ON CONFLICT (email)
                        DO UPDATE SET email = EXCLUDED.email
                        RETURNING id;
                        """,
                        (
                            email,
                            "synthetic_not_for_login",
                        ),
                    )

                    user_id = cur.fetchone()[0]

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

        conn.commit()

    print("Synthetic alumni data seeded successfully.")


if __name__ == "__main__":
    main()