"""Identity allowlist for the original 50 established, non-login demo alumni."""
FIXTURE_IDS = tuple(f"ALUM-{number:03}" for number in range(1, 51))
FIXTURE_PASSWORD = "synthetic_not_for_login"


def fixture_email(synthetic_id):
    if synthetic_id not in FIXTURE_IDS:
        raise ValueError("Unknown deterministic synthetic identity")
    return synthetic_id.lower() + "@synthetic.lumina.local"


FIXTURE_EMAILS = tuple(fixture_email(identity) for identity in FIXTURE_IDS)


def validate_fixture_rows(rows):
    identities = [row["synthetic_id"] for row in rows]
    if len(identities) != len(FIXTURE_IDS) or set(identities) != set(FIXTURE_IDS):
        raise ValueError("Expected exactly the original 50 deterministic fixture identities")
    return rows


def seed_user(conn, email):
    if email not in FIXTURE_EMAILS:
        raise ValueError("Unknown deterministic synthetic identity")
    row = conn.execute("""
        INSERT INTO users (email, password_hash, role, account_status, email_verified, alumni_verified)
        VALUES (%s, %s, 'alumni', 'active', TRUE, TRUE)
        ON CONFLICT (email) DO UPDATE SET account_status = 'active', alumni_verified = TRUE
        WHERE users.password_hash = %s AND users.google_subject IS NULL
          AND users.role = 'alumni' AND users.account_status = 'active'
        RETURNING id
    """, (email, FIXTURE_PASSWORD, FIXTURE_PASSWORD)).fetchone()
    if row is None:
        raise ValueError("Fixture identity collision or protected account; refusing to seed")
    return row[0]
