# Lumina

Lumina is a cloud-focused alumni engagement and mentorship platform developed for the Kenya Airways alumni project.

The platform is designed primarily for former Kenya Airways staff and supports professional networking, mentorship discovery, communication, and alumni engagement.

## Current Development Status

Sprint I established the development environment, database, synthetic data pipeline, and automation required for implementation.

Sprint II is implementing the core mentorship-matching workflow.

Current functionality includes:

- Next.js development environment
- Git and GitHub version control
- Docker and Docker Compose
- PostgreSQL 17
- pgvector
- Automated database schema creation
- Synthetic former-staff data generation
- Automated database seeding
- FastAPI matching service with semantic mentor search
- Pre-trained BGE profile embedding ingestion
- Consent-aware embedding storage in PostgreSQL
- Repeatable indexing and validation tests
- GitHub Actions CI

## Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend and Data

- FastAPI
- Python
- PostgreSQL
- pgvector

### AI Components

- Pre-trained BGE embedding model — implemented for profile indexing
- Semantic similarity search using pgvector — implemented
- Pre-trained language model for grounded match explanations — planned

No AI model is trained or fine-tuned by this project.

## Sprint II Profile Embedding Ingestion

With Docker Desktop running, start the existing database:

```powershell
docker compose up -d
```

Install Python dependencies and run the repeatable profile indexer from the repository root:

```powershell
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe scripts/index_profile_embeddings.py
```

The script reads the root `.env` file without overriding already-defined environment variables.

Database configuration can be supplied using `DATABASE_URL`, or through:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_HOST` — defaults to `localhost`
- `POSTGRES_PORT` — defaults to `5432`

The first profile requiring an embedding loads the pretrained `BAAI/bge-base-en-v1.5` model on CPU.

The first run requires internet access to download the model weights into the standard Hugging Face cache.

The model is used for inference only. No training or fine-tuning is performed.

Each embedding contains 768 values and is normalized before storage.

### Profile Source Text

The embedding source text is constructed deterministically from:

- headline
- biography
- sorted skills
- sorted work experience
- mentorship topics

Work-experience content includes:

- role
- organization
- dates
- current-role indicator
- description

Names, email addresses, identifiers, and account fields are not selected for embedding.

Professional free-text fields should also avoid unnecessary personal identifiers.

### Embedding Freshness

A SHA-256 source hash is generated from:

- canonical profile text
- source-format version
- model name
- pinned model revision

The pinned BGE model revision is:

```text
a5beb1e3e68b9ab74eb54cfd186867f64f240e1a
```

If a profile has not changed, its existing embedding and indexing timestamp are retained without loading the model.

If the profile changes, the embedding is regenerated.

The indexer explicitly rejects:

- empty source text
- source text exceeding the supported token limit
- invalid embedding dimensions
- invalid vectors

The model token limit is checked before encoding rather than silently truncating profile content.

### Consent and Availability

Consent controls membership in the embedding corpus.

A profile is indexed only when:

```text
consent_to_matching = true
```

Availability does not determine whether an embedding exists.

A former staff member may remain indexed while temporarily unavailable for mentorship.

Availability is checked during live mentor search.

If consent is withdrawn, or mentorship preferences no longer exist, the profile's stored embedding is removed during the next indexing run.

Mentor search enforces current consent and availability directly in SQL.

### Indexing Output

The indexing command prints JSON counters:

```text
indexed
skipped
removed
failed
```

Example unchanged rerun:

```json
{
  "failed": 0,
  "indexed": 0,
  "removed": 0,
  "skipped": 41
}
```

The command exits with a non-zero status when failures occur.

Errors do not print profile source text, database credentials, or other sensitive configuration.

## Current Embedding Results

The current synthetic development dataset contains:

- 50 synthetic former-staff profiles
- 42 unique skills
- 41 profiles that consent to matching
- 41 stored profile embeddings
- 768 dimensions per embedding

The final unchanged indexing rerun skips all 41 existing embeddings, confirming that the source-hash mechanism prevents unnecessary regeneration.

Unavailable but consenting profiles remain indexed as intended.

Non-consenting profiles do not have stored embeddings.

## Testing

Run deterministic source and indexing tests with:

```powershell
.venv/Scripts/python.exe -m unittest discover -s services/matching/tests -v
```

To enable live PostgreSQL integration checks:

```powershell
$env:LUMINA_TEST_DATABASE = "1"
.venv/Scripts/python.exe -m unittest discover -s services/matching/tests -v
```

Indexing database tests roll back their changes. Search database tests use
session-local temporary tables and leave the synthetic dataset unchanged.

Current tests cover:

- deterministic profile-text construction
- stable skill ordering
- source-hash changes
- embedding refresh behavior
- consent withdrawal
- availability independence
- invalid-vector handling
- natural-language query validation and sanitization
- live consent and availability filtering
- cosine ranking, tie ordering, thresholds, top-k, and no eligible results

## DevOps / Cloud

- Git
- GitHub
- GitHub Actions
- Docker
- Docker Compose
- AWS planned for deployment

The project uses:

```text
main
```

for stable and demonstrable code, and:

```text
development
```

for active implementation and testing.

Changes are tested before being merged into `main`.

## Project Structure

```text
lumina/
├── data/
│   └── synthetic_alumni.csv
│
├── database/
│   ├── init.sql
│   └── schema.sql
│
├── public/
│
├── scripts/
│   ├── generate_synthetic_data.py
│   ├── seed_database.py
│   ├── index_profile_embeddings.py
│   └── setup.ps1
│
├── services/
│   └── matching/
│       ├── app/
│       │   ├── main.py
│       │   ├── indexing.py
│       │   ├── config.py
│       │   └── search.py
│       │
│       └── tests/
│           ├── test_indexing.py
│           ├── test_indexing_database.py
│           ├── test_search.py
│           └── test_search_database.py
│
├── src/
├── .github/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
├── requirements.txt
└── README.md
```

## Prerequisites

Install:

- Node.js
- npm
- Python 3.14
- Docker Desktop
- Git

On Windows, Docker Desktop should run using WSL 2.

## Environment Configuration

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

The `.env` file is ignored by Git and must not be committed.

## Python Environment

Create a project virtual environment:

```powershell
py -3.14 -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

## Database Setup

Start PostgreSQL and pgvector:

```powershell
docker compose up -d
```

Check container status:

```powershell
docker compose ps
```

The database schema is initialized automatically from the SQL files in the `database` directory when a new PostgreSQL volume is created.

## Synthetic Data

Generate the development dataset:

```powershell
python scripts\generate_synthetic_data.py
```

The development corpus contains fictional former Kenya Airways staff profiles.

It does not contain real Kenya Airways employee personal data.

Seed PostgreSQL:

```powershell
python scripts\seed_database.py
```

## Automated Setup

After installing the required dependencies and activating the Python virtual environment, prepare the development environment using:

```powershell
.\scripts\setup.ps1
```

The setup script:

1. starts Docker Compose,
2. waits for PostgreSQL to become healthy,
3. generates the synthetic dataset,
4. seeds PostgreSQL.

## Run the Web Application

Install Node dependencies:

```powershell
npm install
```

Start the Next.js development server:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

## Run the Matching Service

Start FastAPI:

```powershell
uvicorn services.matching.app.main:app --reload --port 8000
```

Health endpoint:

```text
http://127.0.0.1:8000/health
```

## Google Sign-In

Lumina uses Auth.js (`next-auth` v5, currently pinned to `5.0.0-beta.32`) with
the Google provider in the existing Next.js App Router. The home page offers
Google sign-in, `/sign-in` starts authentication, and `/account` is a protected
page that redirects unauthenticated visitors to `/sign-in`. Signed-in visitors
see their Google name, email and optional image and can sign out.

Auth.js validates the OAuth/OIDC exchange and manages encrypted JWT sessions
in HttpOnly cookies with its default cookie, CSRF, PKCE and redirect protections.
Sessions expire after 24 hours and are verified on the server using `auth()`.
The Lumina account is re-read from PostgreSQL whenever a session is accessed;
suspended or deleted accounts and database failures deny access. This uses
Auth.js JWT sessions, not a new database session table. Sign-out removes the
browser session; individual stolen JWTs cannot be centrally revoked by this
implementation, though account suspension denies access on the next check.
OAuth access, refresh and ID tokens are not added to the public session.

### Versioned local database migration

Migration `database/migrations/001_google_identity.sql` adds a stable Google
identity and a separate alumni-verification flag to the existing `users` table.
It was approved and applied to the local development database on 2026-10-15.
The base `database/schema.sql` includes the same fields for new databases.

```sql
BEGIN;
ALTER TABLE users ADD COLUMN google_subject TEXT UNIQUE;
ALTER TABLE users ADD COLUMN alumni_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
COMMIT;
```

For an existing local development database, preview or apply using:

```powershell
.venv/Scripts/python.exe scripts/migrate_google_auth.py
.venv/Scripts/python.exe scripts/migrate_google_auth.py --apply
```

The runner accepts only a loopback-hosted database named `lumina`, applies the
versioned SQL transactionally, verifies nullability, defaults and uniqueness,
and compares counts and hashes of all existing table contents before committing.
Any preservation failure rolls back the migration. Re-running recognizes the
already-applied schema without repeating DDL. It does not recreate or reseed data.
The `migrations` subdirectory is not run automatically by Docker's initialization
scripts; existing database volumes must use the explicit runner.

The migration preserves existing records, password hashes, roles and account
statuses. Existing users start with `alumni_verified = false`; neither an
existing `alumni` role nor `email_verified` proves alumni eligibility. An
independent Lumina verification process must set alumni verification; this task
does not implement that process.

Google's stable `sub` links directly to `users.google_subject`, and the existing
Lumina UUID is used in the session. A new Google-only account gets no password,
the existing `alumni` role, `account_status = 'pending'`, and
`alumni_verified = false`. The role is an existing account classification, not
verification. Pending accounts can view this basic account page; it grants no
verified-alumni privileges. No professional profile, skills or mentorship
preferences are created or overwritten. Existing subject-linked users keep
their role, status, verification and stored email even if Google's email changes.

A matching email alone never attaches Google to an existing account. Such
sign-ins are refused until an independently authorized linking process associates
the stable Google subject with that Lumina user. This avoids silently taking over
synthetic accounts or admin accounts. An account-linking UI is outside this task.
Missing migration columns fail closed: no authenticated Lumina session is issued.

### Local configuration

Keep secrets in the ignored `.env` or `.env.local`, using `.env.example` only
as a reference. Do not overwrite your existing database configuration.

Configure these server-only variables (never use `NEXT_PUBLIC_` prefixes):

- `AUTH_SECRET`: generate a random secret with `npx auth secret` (at least 32 characters).
- `AUTH_GOOGLE_ID`: Google OAuth client ID.
- `AUTH_GOOGLE_SECRET`: Google OAuth client secret.
- `AUTH_URL`: `http://localhost:3000` for local development; the canonical HTTPS origin in production.
- `DATABASE_URL`, or the existing `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB`, optional `POSTGRES_HOST` and `POSTGRES_PORT`.

Restart Next.js after changing environment variables. The OAuth configuration
must be complete before sign-in is enabled. There is no email-domain restriction:
personal Gmail accounts are allowed. Google's `email_verified` confirms Google
email control only and never sets `alumni_verified`.

### Google Cloud Console setup

1. Choose or create a Google Cloud project and open Google Auth Platform.
2. Configure Branding (app name, support email and developer contact).
3. Choose an **External** audience to allow personal Gmail accounts. While the
   app is in testing, add the Google accounts you will use as test users.
4. Create an OAuth client of type **Web application**.
5. Add `http://localhost:3000` as an authorized JavaScript origin and
   `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.
   Use the same hostname consistently; `127.0.0.1` needs its own registered URI.
6. Copy the client ID and secret into your ignored environment file. Request only
   the provider's basic `openid`, `email`, and `profile` scopes.
7. For a future hosted environment, register its exact HTTPS origin and
   `/api/auth/callback/google` URI and update `AUTH_URL`. No deployment is included here.

Google's configuration requirements are documented in the
[Google OpenID Connect guide](https://developers.google.com/identity/openid-connect/openid-connect)
and [Auth.js Google provider guide](https://authjs.dev/getting-started/providers/google).
Real OAuth sign-in needs your Google Cloud credentials; the local migration is applied.

### Authentication verification

```powershell
npm run test:auth
npm run typecheck
npm run lint
npm run build
# Opt-in PostgreSQL tests (temporary tables; existing data remains unchanged):
$env:LUMINA_TEST_DATABASE = "1"
npm run test:auth
# After npm run build: production HTTP session/sign-out checks on local PostgreSQL
npm run test:auth:http
```

Authentication tests cover Gmail acceptance, Google subject linkage, email
collision rejection, concurrent creation, suspension, safe failures, server
session guards, session-dependent UI, and separate alumni verification without
real Google credentials. Live authentication SQL tests copy the migrated users
schema into session-local temporary tables and verify pending/unverified defaults,
stable identity linkage, email collision rejection, uniqueness and suspension.
The HTTP smoke test starts a temporary production server with an ephemeral test
secret, inserts one uniquely identified test user, and removes that user in a
`finally` block. It checks signed-out redirects, an encrypted test-signed session,
account UI, server-side permissions, real Auth.js sign-out and suspension. It
verifies that existing users are unchanged afterward. It does not simulate or
bypass Google's OAuth exchange in application code.
After configuring Google,
manually verify sign-in, `/account`, and sign-out in a browser.

## Data Ethics

Kenya Airways did not provide a project dataset.

Development and evaluation therefore use synthetic former-staff profiles generated specifically for Lumina.

These synthetic records do not represent real Kenya Airways employees.

## Sprint II Semantic Mentor Search

The implemented retrieval workflow is:

```text
Natural-language mentorship query
        ↓
Pre-trained BGE query embedding
        ↓
pgvector cosine similarity search
        ↓
Current consent filtering
        ↓
Current mentorship availability filtering
        ↓
Top-k ranked former-staff mentor matches
```

Start the service from the repository root using the virtual environment:

```powershell
.venv/Scripts/python.exe -m uvicorn services.matching.app.main:app --port 8000
```

Send `POST /mentors/search` with a JSON body:

```json
{
  "query": "I need mentorship in AWS, Docker and DevOps careers",
  "top_k": 5,
  "similarity_threshold": 0.5
}
```

Only `query` is required. Optional request overrides take precedence over
`MATCHING_TOP_K` (default 5, range 1–50) and `MATCHING_SIMILARITY_THRESHOLD`
(default 0.5, range -1–1) in the root `.env` or process environment.
Environment changes require a service restart because settings are cached.

Queries must contain non-whitespace text and be at most 500 characters,
both before and after sanitization. Input is normalized to Unicode NFC and
whitespace is collapsed. Unsupported control and invisible characters, wrong
types, unknown fields, and invalid numeric settings return HTTP 422. The model's
token limit is also enforced, including the retrieval instruction; text is never
silently truncated. Database or model failures return HTTP 503 without exposing
queries, credentials, or exception details. `/health` remains a liveness check.

`GET /ready` returns HTTP 200 with `{"status":"ready","service":"matching"}`
when configuration, PostgreSQL search dependencies and the embedding model are
available; otherwise it returns HTTP 503 with status `not_ready`. It plans the
existing search SQL without executing retrieval, checking required tables,
columns, privileges and the pgvector cosine operator. Database planning has a
three-second statement timeout; connection establishment has a ten-second timeout.
The first readiness check can load the model; later checks reuse it and never
perform embedding inference. A model inference failure marks the process unready
until a subsequent successful search confirms recovery. Invalid or oversized
queries do not change model readiness. Readiness does not verify corpus freshness
or guarantee the next inference will succeed.

Public validation errors omit input values and redact unknown field names.
Unexpected failures, including response validation failures, return a generic
HTTP 503. Internal logs record the failing operation and exception class without
logging raw exception messages, query text or profile source content.

Search reuses the indexer's pretrained BGE model and pinned revision. Following
the model's retrieval guidance, only query text receives the prefix
`Represent this sentence for searching relevant passages: `. Profile text
remains unprefixed. Query vectors are normalized and validated as 768 finite
values. One model is loaded lazily per service process and reused; CPU inference
is serialized to bound concurrent model work. The first search can take longer.

The response contains `results`, the effective `top_k`, and effective
`similarity_threshold`. Each result contains `profile_id`, `headline`,
`former_kq_role`, `former_kq_department`, `current_job_title`,
`current_organization`, `relevant_skills`, and `similarity_score`.
`relevant_skills` contains the matched profile's actual stored skills in sorted
order; skills are not individually scored or inferred. Scores are raw cosine
similarities, not confidence probabilities. No eligible results returns HTTP
200 with an empty list.

SQL computes `1 - (embedding <=> query_vector)` and filters by model name,
current consent and availability before the threshold and top-k limit. All
values are bound parameters. Results sort by descending similarity, with
`profile_id` as a deterministic tie-break. Exact search is sufficient for this
small corpus; there is no approximate vector index or schema change.

The default threshold is provisional and needs labeled relevance evaluation.
Profile embeddings must be refreshed after edits; search does not recompute
source hashes. Eligibility reflects the database snapshot of the search
statement. Capacity, authentication and mentorship assignments remain future
work. No frontend UI or LLM explanations are included in this milestone.

LLM-generated explanations, broader engagement features, and additional cloud infrastructure will be added after the retrieval workflow is stable and tested.

### Mentorship proxy public origin

Set server-only `APP_ORIGIN=http://localhost:3000` locally. In production, set it
at runtime to the canonical public HTTPS origin (for example,
`https://alumni.example.com`), consistent with the browser URL and `AUTH_URL`.
Never use a `NEXT_PUBLIC_*` variable. The value must be an HTTP(S) origin with
an optional trailing slash, without credentials, paths, queries, or fragments.

The mentorship POST requires an authenticated, authorized account and an Origin
header matching APP_ORIGIN after URL normalization of scheme, hostname, and
default ports. Missing, opaque, malformed, and external origins are rejected
with 403. There is no server-call or Fetch Metadata exception: intentional server
callers must supply the configured Origin and still authenticate. Origin is a
browser CSRF check, not a substitute for authentication.

The check ignores request.url, Host, X-Forwarded-Host, and X-Forwarded-Proto.
Reverse proxies and AWS load balancers may use internal listening names; they
must preserve the browser Origin header. Configure the public HTTPS origin even
when TLS terminates at the load balancer. Alternate public aliases must redirect
to the canonical origin before use. Missing or invalid APP_ORIGIN causes an
otherwise authorized request to return a generic 503 without calling matching;
server logs contain only a fixed configuration diagnostic, never the value.
Configuration is validated per authorized request rather than during build.
