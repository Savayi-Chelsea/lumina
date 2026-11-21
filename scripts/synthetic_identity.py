"""Identity allowlist for the deterministic, non-login synthetic demo alumni.

ALUM-001..ALUM-050 are the original Sprint I fixtures; ALUM-051..ALUM-200 extend
the dataset (Issue #5). All are fictional and can never sign in.
"""
FIXTURE_COUNT = 200
ORIGINAL_FIXTURE_COUNT = 50
FIXTURE_IDS = tuple(f"ALUM-{number:03}" for number in range(1, FIXTURE_COUNT + 1))
ORIGINAL_FIXTURE_IDS = FIXTURE_IDS[:ORIGINAL_FIXTURE_COUNT]
FIXTURE_PASSWORD = "synthetic_not_for_login"


def fixture_email(synthetic_id):
    if synthetic_id not in FIXTURE_IDS:
        raise ValueError("Unknown deterministic synthetic identity")
    return synthetic_id.lower() + "@synthetic.lumina.local"


FIXTURE_EMAILS = tuple(fixture_email(identity) for identity in FIXTURE_IDS)
ORIGINAL_FIXTURE_EMAILS = FIXTURE_EMAILS[:ORIGINAL_FIXTURE_COUNT]


def validate_fixture_rows(rows):
    identities = [row["synthetic_id"] for row in rows]
    if len(identities) != len(FIXTURE_IDS) or set(identities) != set(FIXTURE_IDS):
        raise ValueError(f"Expected exactly the {FIXTURE_COUNT} deterministic fixture identities")
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
