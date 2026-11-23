# Lumina

Lumina is a cloud-focused alumni engagement and mentorship platform developed for the Kenya Airways alumni project.

The platform is designed primarily for former Kenya Airways staff and supports professional networking, mentorship discovery, communication, and alumni engagement.

## Current Development Status

Lumina is live at **https://56-228-133-218.sslip.io**, deployed on a single AWS
EC2 server (see [Deployment on AWS](#deployment-on-aws)). Sprint I established the
development environment, database, synthetic data pipeline and automation; Sprint II
delivered the mentorship-matching workflow, the community features and the Chapter 4
evaluation.

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
- Email/password and Google sign-in sharing one Lumina session model
- Emailed, single-use password reset (local Mailpit inbox)
- Admin-managed events with RSVP, capacity, "who's going" and Add to calendar (Google, Outlook.com, .ics)
- Opportunities: a daily feed of real jobs in Kenya (JobWebKenya on-site, Himalayas remote)
- Fill in your profile from a CV (PDF or Word), read in the browser and reviewed before saving
- Admin user management (suspend and reinstate)
- 500 synthetic alumni with work histories (setup seeds 200; `scripts/extend_demo_alumni.py` adds the other 300), and a 500-record verification registry
- Reproducible matching evaluation (P@5, R@5, F1@5, MRR) against a keyword baseline
- LinkedIn-style profiles: banner, photo upload, About, Experience timeline, Kenya Airways chapter, Skills and Mentorship
- Connections, 1:1 messaging, mentorship requests and in-app notifications
- Grounded "Why this match" explanations on mentor results
- Kafka event streaming: profile edits trigger automatic re-embedding through a transactional outbox
- Pre-trained BGE profile embedding ingestion
- Consent-aware embedding storage in PostgreSQL
- Repeatable indexing and validation tests
- GitHub Actions CI
- "For you" job recommendations by former Kenya Airways department
- Sign-up verification against the alumni registry, with the department chosen from the registry's list
- Searchable A–Z skills dropdown (743 skills) and plain-language match strength (Strong, Good or Possible match)
- Admin: verification exceptions, users, events, jobs feed, session recaps, insights, system health and an append-only audit log
- Production deployment on AWS: Docker Compose, Caddy HTTPS, deploys over AWS Systems Manager
- One-command setup for Linux, macOS and GitHub Codespaces (`.devcontainer/`, `scripts/setup.sh`, `scripts/start.sh`)

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

- 200 synthetic former-staff profiles (ALUM-001 to ALUM-200) across all 12 departments
- 532 work-history entries (Kenya Airways role, optional intermediate role, current role)
- 84 unique skills
- 169 profiles that consent to matching, all with stored embeddings
- 133 consenting profiles currently available as mentors
- 768 dimensions per embedding

An unchanged indexing rerun skips every existing embedding, confirming that the source-hash mechanism prevents unnecessary regeneration.

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

## Evaluation (Chapter 4)

The complete evaluation lives in [`evaluation/`](evaluation/): the written report
([`EVALUATION_REPORT.md`](evaluation/EVALUATION_REPORT.md)), quantitative findings for the
abstract ([`ABSTRACT_FINDINGS.md`](evaluation/ABSTRACT_FINDINGS.md)), per-query CSVs, latency
samples, test results and figures. [`evaluation/README.md`](evaluation/README.md) lists the
commands to reproduce every number:

```bash
.venv/bin/python scripts/evaluate_matching.py        # semantic vs keyword vs hybrid, CIs, significance, threshold
.venv/bin/python scripts/evaluate_correctness.py     # ranking, consent, threshold, top-k, recommendations
node --no-warnings scripts/evaluate_explanations.mjs # "Why this match" grounding
.venv/bin/python scripts/evaluate_event_pipeline.py  # outbox -> Kafka -> worker -> search, with outages
node --no-warnings scripts/evaluate_performance.mjs  # latency, idle and under concurrent matching
bash scripts/evaluate_test_suites.sh                 # every automated suite, machine-readable results
.venv/bin/python scripts/evaluation_charts.py && node scripts/render_charts.mjs   # figures
```

Usability testing is prepared (protocol, tasks, SUS questionnaire, scorer) in
`evaluation/usability/` but has not been run; no usability results are reported.

## DevOps / Cloud

- Git
- GitHub
- GitHub Actions
- Docker
- Docker Compose
- AWS (EC2, Systems Manager, Parameter Store) for the live deployment

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

## Deployment on AWS

The live site, **https://56-228-133-218.sslip.io**, runs on one EC2 server in
eu-north-1 (Stockholm): an m7i-flex.large with Ubuntu 24.04 and a 30 GB encrypted disk,
behind Elastic IP 56.228.133.218. sslip.io turns that IP into a hostname, so no domain is
needed. The security group allows only ports 80 and 443, with no SSH; administration goes
through AWS Systems Manager. Every resource is tagged `Project=lumina`. Running cost is
about $2.65 a day, or about $6 a month while stopped.

`deploy/compose.prod.yml` runs eight containers with host networking:

| Container | Role |
| --- | --- |
| `caddy` | The only public entry point; obtains and renews the HTTPS certificate (Let's Encrypt) |
| `web` | Next.js app on port 3000 (`deploy/Dockerfile.web`) |
| `matching` | FastAPI mentor search with the BGE model on port 8000 (`deploy/Dockerfile.python`) |
| `events` | Kafka worker that re-indexes changed profiles |
| `email` | Reminder and digest worker, sending to Mailpit |
| `postgres` | PostgreSQL 17 with pgvector, data in a named volume |
| `kafka` | Profile-change events from the transactional outbox |
| `mailpit` | Captures email on the server's loopback interface only |

**Secrets.** `deploy/.env` is generated on the server (chmod 600) and never committed;
`deploy/.env.production.example` is the template. The Google sign-in client ID and secret
are SecureString parameters in Parameter Store (`/lumina/AUTH_GOOGLE_ID`,
`/lumina/AUTH_GOOGLE_SECRET`). The Google consent screen is in Testing, so only Google
accounts on its test-user list can sign in with Google.

**Deploying a change.** The server tracks `development` in `/opt/lumina` and pulls from
GitHub, so push first:

```bash
aws login --remote --region eu-north-1 --profile lumina   # session lasts about 12 hours
bash scripts/deploy-aws.sh development                      # 3-4 minutes; only changed containers restart
```

Expect a minute or two of downtime, and about one more minute before mentor search
answers while the model reloads. Merge `development` into `main` once it checks out.

**One-off scripts on the server** (no rebuild or downtime): pull, then run the script in
the existing Python image with the repository mounted, through Systems Manager.

```bash
cd /opt/lumina && git pull
cd deploy && docker compose -f compose.prod.yml run --rm --no-deps -v /opt/lumina:/app events python scripts/<script>.py
```

**Backups.** Database dumps on the server live in `/opt/lumina-backups/` (root only). To
take one:

```bash
cd /opt/lumina/deploy && . ./.env
docker compose -f compose.prod.yml exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > /opt/lumina-backups/<name>.dump
```

Restoring (`pg_restore --clean --if-exists`) has not been rehearsed; try it on a local
copy first. Reading the server's email needs a Systems Manager port-forward to port 8025.

## Project Structure

```text
lumina/
├── .devcontainer/          Codespaces configuration
├── .github/workflows/      CI: npm ci, lint, tests, production build
├── data/                   200 synthetic alumni and their registry records
├── database/               schema.sql and numbered migrations (001 to 011)
├── deploy/                 production Dockerfiles, compose file, Caddyfile
├── evaluation/             Chapter 4 report, datasets (incl. 500 profiles), results, figures
├── public/                 logo, cover art
├── scripts/                setup, start, seeding, evaluation, AWS deploy, admin tools
├── services/matching/      FastAPI matching service, Kafka worker and their tests
├── src/                    Next.js app: app/ (pages, actions, API), components/, lib/
├── tests/                  web, registry, synthetic-data and browser tests; CV fixtures
├── docker-compose.yml      local PostgreSQL, Kafka and Mailpit
├── package.json
├── requirements.txt
└── README.md
```

## Quick start: Linux, macOS and GitHub Codespaces

The sections after this one describe each step on Windows (PowerShell). On Linux,
macOS or in a codespace, two commands do everything:

```bash
bash scripts/setup.sh   # .env, npm ci, .venv (CPU-only PyTorch), containers, demo data, Playwright Chromium
bash scripts/start.sh   # containers + matching API + Kafka worker + email worker + web app; Ctrl+C stops all
```

`setup.sh` is safe to re-run: it keeps your `.env` values and only seeds an empty
database. `start.sh` rebuilds the web app when sources changed (`--dev` runs
`next dev` instead) and prefixes each process's log lines.

**GitHub Codespaces.** The repository includes `.devcontainer/devcontainer.json`
(4 cores, 16 GB, the standard `universal` image with Node 24, Python 3.14 and
Docker). Creating a codespace runs `setup.sh` (about 10 minutes, including the BGE
model download). Each start runs `scripts/containers.sh`, which recreates the
containers. Docker-in-Docker can lose a container's writable layer across a
codespace restart ("RWLayer of container … is unexpectedly nil"); the data lives in
named volumes, so recreating containers fixes this without losing anything. Run
`bash scripts/containers.sh` by hand if that error appears.

Keep secrets as [Codespaces secrets](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces)
(`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, optional `JSEARCH_API_KEY`),
not in committed files. They arrive as environment variables, which take
precedence over `.env` for Next.js, the Python scripts and Docker Compose.
`python3 scripts/setup_env.py` (run by `setup.sh`) creates or updates `.env`
without overwriting real values, and inside Codespaces configures port forwarding:

- `SERVER_ACTIONS_ALLOWED_ORIGINS=localhost:3000`: the Codespaces proxy rewrites a
  same-site `Origin` header to `http://localhost:3000` while forwarding the public
  host in `x-forwarded-host`, so without this Next.js rejects every form
  submission (sign-in, profile edits) with "Invalid Server Actions request".
- `AUTH_TRUST_HOST=true` and no fixed `AUTH_URL`: Auth.js builds its callback URL
  from the forwarded host, so both `https://<codespace>-3000.app.github.dev` and
  VS Code's `http://localhost:3000` forwarding work.

### Demo accounts and administrators

Seeded alumni cannot sign in. For demonstrations, list sign-in accounts in a
gitignored `.demo-accounts.json` and create (or restore) them with one command:

```bash
cat > .demo-accounts.json <<'EOF'
[
  { "email": "member@example.com", "password": "a long passphrase", "name": "Member Name", "role": "alumni" },
  { "email": "admin@example.com", "password": "another passphrase", "name": "Admin Name", "role": "admin" }
]
EOF
npm run demo:accounts
```

Passwords are hashed with the app's own Argon2id code. Alumni accounts become
active and verified with a name-only draft profile. Existing profiles,
connections and messages are kept. The command only targets the local `lumina`
database.

To give demo accounts a lived-in network, run `seed_demo_activity.py` after
`demo:accounts` (it previews without `--apply`, and reruns add only what is missing):

```bash
.venv/bin/python scripts/seed_demo_activity.py --member member@example.com --mentor mentor@example.com --apply
```

- `--member`: accepts the member's own pending invitations (with "accepted your
  request" notifications), adds connections up to `--connections` (default 110),
  leaves five incoming invitations and starts eight message threads (three unread).
- `--mentor`: completes a fictional cloud-architect mentor profile (only while it is
  still a draft), with skills, experience, matching consent and topics, and queues it
  for re-indexing so it appears in mentor search. It also adds about 48 connections,
  two accepted mentorships and one pending request. The member and the mentor are not
  linked, so a mentorship request between them can be shown live.

To make any account that signed up through the app (Google or email) an
administrator, use the following commands. Each change is written to the audit log.

```bash
.venv/bin/python scripts/manage_admin.py promote you@example.com
.venv/bin/python scripts/manage_admin.py list
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

This writes `data/synthetic_alumni.csv` (200 profiles) and
`data/synthetic_work_history.csv`. The original Sprint I rows ALUM-001 to
ALUM-050 come from the unchanged seeded sequence; a test checks their SHA-256
fingerprint, so the expansion can never alter them. ALUM-051 to ALUM-200 come
from an independent seeded generator (`scripts/synthetic_expansion.py`) that
rotates through all 12 departments and gives each profile a plausible career
path, skills, location and work history.

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
When the email already belongs to a Lumina account, Google sign-in returns to
`/sign-in?error=account-exists`, which asks the person to use their email and password.
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
8. In GitHub Codespaces, also register the forwarded address. `python3 scripts/setup_env.py`
   prints both URIs for your codespace:
   `https://<codespace-name>-3000.app.github.dev/api/auth/callback/google` and
   `http://localhost:3000/api/auth/callback/google`. Without the first one, Google
   answers `redirect_uri_mismatch` when the app is opened at the `app.github.dev` address.

A first Google sign-in creates a pending, unverified Lumina account with a
name-only draft profile from the Google display name, the same starting point as
email registration. The member then verifies against the alumni registry
(`/verify`: staff number `SYN-ALUM-001` to `SYN-ALUM-500`, surname, department chosen from
the registry's list, and service years must all match one unclaimed record) and completes
their profile. An existing account with the same email
is never linked or overwritten.

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

## Email and password sign-in

Lumina offers conventional email/password accounts alongside Google. Both use
the same Auth.js JWT session, and every request re-reads role, account status and
alumni verification from PostgreSQL, so suspension and verification changes take
effect immediately for either sign-in method.

| Route | Purpose |
| --- | --- |
| `/sign-in` | Email and password first, then "or continue with" Google, then a link to create an account |
| `/sign-up` | Full name, email, password and confirmation; Google below |
| `/forgot-password` | Requests an emailed reset link when email is configured; otherwise says plainly that reset is unavailable |
| `/reset-password` | Sets a new password from a single-use emailed link |

The public landing page links to **Join Lumina** (`/sign-up`) and **Sign in** (`/sign-in`).

**Registration** trims and lowercases the email, rejects duplicates
case-insensitively (including emails already used by Google accounts), hashes the
password, and creates an `alumni` account with `account_status = 'pending'`,
`alumni_verified = false` and `email_verified = false`. A name-only draft profile
(`profile_completed = false`) stores the full name. It is invisible to Network until
verification and is not indexed for mentorship unless the member later consents.
The person is signed in and continues through the existing flow:
account → alumni verification → profile completion → Lumina. Registration never
verifies former Kenya Airways employment.

**Password storage** uses Argon2id from Node.js's built-in `crypto.argon2`
(Node.js 24.7 or later; no extra npm dependency) with OWASP baseline parameters:
19 MiB memory, 2 passes, 1 lane, a 16-byte random salt and a 32-byte tag, stored as
a PHC string in `users.password_hash`. Verification is constant-time. Missing or
unrecognised hashes, including Google-only accounts (`NULL`) and the synthetic
fixtures' `synthetic_not_for_login` marker, never verify. An unknown email still
performs one Argon2 derivation, so timing does not reveal whether an account exists.

**Password policy:** 10–128 characters, with no composition rules, so passphrases
work well.

**Sign-in failures** always show "Email or password is incorrect." This covers
wrong passwords, unknown emails, Google-only accounts and suspended accounts.
Passwords are never logged and hashes never leave the server's authorize step.

**Google coexistence:** accounts are never linked by email. Google-only users keep
a `NULL` password and are never asked to create one.

**No schema change** was required for this milestone.

### Abuse protection and production gaps

- Failed sign-ins are limited to 5 per email per 15 minutes by an in-memory,
  per-process limiter. It resets on restart and is not shared across instances.
  Production needs a shared store (database table or cache) and per-IP limits at
  the load balancer or WAF. Per-email lockout also lets someone temporarily block a
  known email; a shared limiter should combine email and client signals.
- Registration is not rate limited beyond the cost of hashing; add edge limits
  before public deployment.
- Email ownership is not verified for password accounts (no email provider).
  Alumni verification still gates every privileged feature.
- Password reset is implemented (see "Password reset" below). JWT sessions issued
  before a reset stay valid until they expire (24 hours); revoking them needs a
  per-user session version, which is not implemented yet.

### Password authentication tests

`npm run test:auth` covers hashing, plaintext never stored, correct/incorrect
passwords, unknown emails, duplicate registration, malformed email, weak password,
mismatched confirmation, Google-only and fixture accounts, suspension, rate
limiting, Google/password email conflicts, and role/verification refresh.
With `LUMINA_TEST_DATABASE=1`, `tests/auth/password-auth.database.test.ts` runs
the same flows against temporary copies of `users` and `profiles`.
`npm run test:frontend:browser` registers a disposable password account through
the real UI, checks duplicate, wrong-password, unknown-email, rate-limit and
correct sign-in behavior, and removes the account afterwards. It also checks the
auth pages for overflow and touch-sized inputs at 320, 375, 768, 1024 and 1440 px.

## Sprint II: community, account recovery and evaluation

### Fresh demo setup

```powershell
docker compose up -d                                   # PostgreSQL + Mailpit
.venv/Scripts/python.exe scripts/apply_migration.py 004 --apply   # events, registrations, opportunities
.venv/Scripts/python.exe scripts/apply_migration.py 005 --apply   # password reset tokens
.venv/Scripts/python.exe scripts/apply_migration.py 006 --apply   # profiles, connections, messaging, notifications, outbox
.venv/Scripts/python.exe scripts/apply_migration.py 007 --apply   # session recaps and reactions
.venv/Scripts/python.exe scripts/apply_migration.py 008 --apply   # match tracking, privacy, sessions, audit log, email
.venv/Scripts/python.exe scripts/apply_migration.py 009 --apply   # Kenya job feed
.venv/Scripts/python.exe scripts/apply_migration.py 010 --apply   # JobWebKenya job source
.venv/Scripts/python.exe scripts/apply_migration.py 011 --apply   # applications to community opportunities
.venv/Scripts/python.exe scripts/generate_synthetic_data.py
.venv/Scripts/python.exe scripts/seed_database.py
.venv/Scripts/python.exe scripts/index_profile_embeddings.py
.venv/Scripts/python.exe scripts/seed_community.py --apply
.venv/Scripts/python.exe scripts/generate_avatars.py --apply      # illustrated portraits + cover themes
.venv/Scripts/python.exe scripts/seed_connections.py --apply      # add --member EMAIL for a demo account
.venv/Scripts/python.exe scripts/seed_recaps.py --apply           # add --member EMAIL for a demo account
```

Services for a full demo (each in its own terminal):

```powershell
npm run dev
.venv/Scripts/python.exe -m uvicorn services.matching.app.main:app --port 8000   # mentor search + recommendations
.venv/Scripts/python.exe scripts/run_profile_events.py                           # Kafka re-indexing
.venv/Scripts/python.exe scripts/run_notifications.py                            # reminders and digest emails
```

`apply_migration.py` fingerprints every existing table before and after and
rolls back if any existing row changes, so migrations 004 and 005 can only add
tables. Without `--apply` it previews. Both are idempotent and also included in
`database/schema.sql` for brand-new databases.

### Events

- `/events` lists published events for active, verified alumni (and admins),
  split into Upcoming and Past, with an In person / Online / Hybrid filter in the URL.
- `/events/[id]` shows details and a one-click **Reserve my place** / **Cancel**.
  Registration is serialised per event with a row lock, so capacity is never
  exceeded, even under concurrent requests (covered by a multi-connection test).
  Registration closes when the event starts.
- **Who's going** shows a few attendees' photos and "You, Amina Otieno and 41 others
  are attending" (or "attended" for past events). Only members listed in the directory
  are named; everyone else is counted.
- After reserving a place, **Add to your calendar** offers Google Calendar and
  Outlook.com links and an `.ics` download (`/api/events/[id]/ics`, for Apple Calendar
  and desktop Outlook) with a 30-minute reminder and a link back to the event.
- `seed_community.py --apply` fills the sample events with synthetic attendees, from
  the matching department or city first. Upcoming events always keep free places,
  and real members' registrations are never touched.
- Home shows the next three events, with "You're attending" on reserved ones.
- Times are entered and shown in East Africa Time.

### Opportunities

- **Opportunities** shows the Kenya job feed only (`/opportunities` redirects to
  `/opportunities/jobs`, keeping any search). Home's "What could come next?" shows four
  jobs, picked for the member's former department when possible.
- Admin-posted community listings ("From the community") were retired on 2026-11-22:
  their member and admin pages were removed. The `opportunities` and
  `opportunity_applications` tables and the library code in `src/lib/community.ts`
  (with its tests) remain, so the feature can be restored.

### Administration

- `/admin/events`: create, edit, publish, unpublish, archive and restore; event pages
  list attendees. `/admin/jobs` (**Jobs feed**) shows each job source's status and has
  **Refresh now**; `/admin/opportunities` redirects there. Drafts and archived listings
  are hidden from alumni. Validation errors keep everything the admin typed.
- `/admin/users`: search by name or email, filter by status, and suspend or
  reinstate alumni accounts. Suspension takes effect on the person's next request,
  because sessions are re-checked against PostgreSQL. Administrators and the acting
  admin cannot be changed here. Reinstated accounts return to active if already
  verified, otherwise to pending verification.
- `/admin` shows open verification exceptions, upcoming events, reserved places,
  open opportunities and drafts.

`scripts/seed_community.py --apply` adds 8 fictional sample events (6 upcoming,
2 past) and 7 sample opportunities (1 closed), all marked `synthetic` and labelled
"Sample listing" in the interface. Dates are relative to the day you run it, so
rerun it before a demo to keep events upcoming. It updates sample rows in place
and never touches admin-created listings or registrations.

### Password reset

Local email goes to Mailpit (started by `docker compose up -d`); read it at
http://localhost:8025. Nothing leaves your machine. Configure in `.env`:

```
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
MAIL_FROM="Lumina <no-reply@lumina.local>"
```

For production, point the same variables (plus `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASSWORD`) at a real SMTP provider. Without them, `/forgot-password`
says reset is unavailable and sends nothing.

- The response is identical whether or not the email has an account. Token
  creation and sending run after the response (`after()`), so timing does not
  reveal it either.
- Only password accounts that are not suspended receive links; Google-only and
  synthetic fixture accounts never do. At most 3 requests per email per 15 minutes.
- Tokens are 32 random bytes; only their SHA-256 digest is stored. They expire in
  30 minutes, work once, and requesting a new one revokes the old one.
- The link carries the token in the URL fragment (`/reset-password#token=…`),
  which browsers never send to servers or in `Referer` headers. The page removes
  it from the address bar immediately.
- A successful reset clears the sign-in lockout for that email.

Email is sent with `nodemailer` 8.0.11, pinned exactly. It is the release line
Auth.js declares as its optional peer, and it was chosen to be more than two weeks old.

### Matching evaluation

```powershell
.venv/Scripts/python.exe scripts/evaluate_matching.py --build-labels   # after the dataset changes
.venv/Scripts/python.exe -m uvicorn services.matching.app.main:app --port 8000
.venv/Scripts/python.exe scripts/evaluate_matching.py
```

22 labelled queries run through the real `POST /mentors/search` endpoint and a
TF-IDF keyword baseline over the same profile text. Results are written to
`evaluation/results/matching_evaluation.md` and `.json`; labels are frozen in
`evaluation/relevance_labels.json`.

| Query set | System | P@5 | R@5 | F1@5 | MRR |
| --- | --- | --- | --- | --- | --- |
| Domain (12) | Semantic | 1.000 | 0.475 | 0.637 | 1.000 |
| Domain (12) | Keyword | 1.000 | 0.475 | 0.637 | 1.000 |
| Career transition (10) | Semantic | 0.620 | 0.477 | 0.482 | 0.775 |
| Career transition (10) | Keyword | 0.500 | 0.331 | 0.358 | 0.667 |

Domain queries name the department area, so both systems reach the ceiling.
Transition queries describe a move ("leave aviation and work in a bank") whose
answer depends on the mentor's current industry, title or organization; there
semantic matching outperforms keyword matching. An off-topic control query returns
no results. These are synthetic, rule-labelled results, not a measure of
performance on real Kenya Airways alumni.

The extended Chapter 4 evaluation (confidence intervals, significance tests, threshold
analysis, correctness, event pipeline, latency) is in [`evaluation/`](evaluation/README.md).

## Social network and event-driven matching

### Profiles

`/profile` is your own LinkedIn-style profile: a banner (five themes), photo,
headline, current role, location, connection count and "Open to mentoring" /
"Open to opportunities" badges, then About, Experience (timeline with durations),
Kenya Airways chapter, Skills and Mentorship. Pencil and plus icons open the
editors under `/profile/edit`:

| Editor | What it changes |
| --- | --- |
| `/profile/edit` | Name, headline, current role, location, About, Kenya Airways chapter, banner, open-to-opportunities |
| `/profile/edit/experience` | Add, edit and delete roles (month precision, "I currently work here") |
| `/profile/edit/skills` | Add (up to 30, reusing existing skill names case-insensitively) and remove skills. A searchable dropdown lists 740+ skills across all fields A to Z (`src/lib/skill-catalog.ts`, plus skills already on two or more profiles); typing filters it, with names that start with the text first. Members can still add their own |
| `/profile/edit/mentorship` | Matching consent, availability and up to 10 topics |
| `/profile/edit/photo` | Upload a photo (cropped and resized to 400 × 400 JPEG in the browser), or remove it |
| `/profile/edit/cv` | **Fill in from CV**: suggests headline, current role, location, About, roles with dates, skills and the Kenya Airways chapter from a PDF or Word CV; the member ticks and edits what to keep |

#### Fill in from your CV

- The CV is read **in the member's browser** (PDF.js via `unpdf` for PDF, `mammoth` for
  .docx, both loaded only on that page). The file is never uploaded or stored; only the
  details the member ticks are sent, as JSON, and validated with the same rules as the
  individual editors (`parseCvImport` in `src/lib/profile-editor.ts`).
- `src/lib/cv-parser.ts` is rule-based and deterministic, with no AI service, so no CV
  content leaves the device. It recognises section headings, a date range per role
  (`Jan 2020 – Present`, `03/2019 - 12/2021`, `2015 to 2018`), one-line headers
  (`Title | Company | dates`, `Title at Company`) and LinkedIn's **Save to PDF** export,
  and matches skills against the 743-skill catalog.
- Fields already filled start unticked and show what they would replace; roles already on
  the profile are flagged; skills respect the 30-skill limit. Saving runs in one
  transaction and queues the profile for re-indexing (`cv_import` in the outbox).
- Scanned (image-only) PDFs have no text to read; members are asked for a PDF exported from
  Word, Google Docs or LinkedIn. Sample CVs for demos and tests are in `tests/fixtures/cv/`.

Photos are checked by file signature (JPEG, PNG or WebP only, at most 512 KB) and stored in
`profile_photos`. They are served by `/api/profile-photo/[id]` only to signed-in members who may
see that profile, with `private` caching, `nosniff` and a `default-src 'none'` CSP.

`/alumni/[id]` shows the same layout for other members, with **Connect**, **Message**
(once connected or in a mentorship) and **Request mentorship** (when they offer it), plus
"People also viewed". Internal user ids are resolved on the server and never rendered.

### Connections, messages, mentorship requests and notifications

- **My network** (`/network/connections`): accept or ignore invitations, message or remove
  connections, withdraw sent invitations, and "People you may know" (same former
  department, then shared skills, then shared industry). A crossing request is accepted
  rather than duplicated; a declined request can be sent again later.
- **Messages** (`/messages`): 1:1 conversations between connections or mentorship pairs,
  unread counts, read receipts on open, 2,000-character limit. Removing a connection
  stops further messages.
- **Mentorship requests**: from a mentor's profile or a search result, send a goal and
  message (one pending request per mentor). `/mentorship/requests` lists received and sent
  requests; accepting opens a conversation that starts with the original request.
- **Notifications** (`/notifications`): invitations, acceptances, messages (one unread
  notification per sender) and mentorship replies. The header shows unread counts for
  messages and notifications (inside the account menu on narrow phones).

### Match strength instead of a raw score

Mentor cards show **Strong match**, **Good match** or **Possible match** instead of the
cosine similarity (scores cluster between 0.50 and 0.70, so a third-decimal difference
looked meaningful but is not). The bands come from the matching evaluation's 110 semantic
results (`evaluation/results/matching/per_query_rankings.csv`): every result at 0.60 or
above was relevant, 73% between 0.55 and 0.60, and 52% between the 0.50 threshold and
0.55 (`src/lib/match-strength.ts`). Exact scores are still logged for evaluation.

### Grounded match explanations

Each mentor result shows "Why this match", built only from overlaps between the
member's own words and the mentor's stored skills, mentorship topics, current role
or former KQ role (`src/lib/match-explanation.ts`). When the ranking reflects meaning
rather than shared words, it states the mentor's role facts instead of inventing an
overlap. No language model is involved, so explanations cannot hallucinate.

### Kafka re-indexing

Profile, skills, experience and mentorship-settings changes insert a row into
`profile_change_outbox` in the same database transaction. A worker then:

1. **Relays** pending rows to the Kafka topic `lumina.profile-changes` (3 partitions,
   keyed by profile id so each profile's events stay ordered), marking them published
   only after Kafka acknowledges them (`acks=all`).
2. **Consumes** the topic in the `lumina-matching-indexer` group, re-embeds only the
   changed profiles with the existing BGE indexer, and commits offsets after the
   database work succeeds.

A crash replays events rather than losing them, and source hashes make replays harmless.
If Kafka or PostgreSQL restarts, the worker reconnects on its own, and if it starts
before Kafka is reachable it waits (with back-off) instead of exiting.

```powershell
docker compose up -d kafka
.venv/Scripts/python.exe scripts/run_profile_events.py
# Optional live broker test:
$env:LUMINA_TEST_KAFKA = "1"; .venv/Scripts/python.exe -m unittest services.matching.tests.test_profile_events
```

Kafka runs as a single KRaft node (`apache/kafka:4.1.0`, no ZooKeeper) published on
`127.0.0.1:9092`; the Python client is `kafka-python==3.0.11`. The full re-index script
(`scripts/index_profile_embeddings.py`) still works for bulk rebuilds.

### Presentation of seeded data

The site presents all members, events and opportunities as a normal community: no
"synthetic", "sample" or "fictional" labels appear to members. All seeded data remains
fictional, and that is documented here, in the evidence pack and in the report. Only
the admin Users page marks seeded accounts ("Seeded", no sign-in), because they cannot log in.

### A lived-in community

The seeded data is generated locally, with no external service, and every script is
deterministic and safe to rerun (it previews without `--apply`):

| Script | What it creates |
| --- | --- |
| `generate_avatars.py --apply` | An illustrated portrait for each seeded alumnus (Pillow, varied skin tone, hair, head covering, glasses and attire; style follows the first name, ambiguous names get neutral styles) and a random cover theme |
| `generate_cover_art.py` | The five cover illustrations in `public/covers/` (Nairobi skyline, savanna, coast, night runway, Mount Kenya at dawn) |
| `seed_connections.py --apply` | About 2,000 accepted connections (6 to 64 per person, median 18), mostly within former departments. `--member EMAIL` gives a real verified account 28 to 45 connections and 3 pending invitations |
| `seed_recaps.py --apply` | 48 accepted mentorships with opening conversations, about 58 published session recaps and 500+ reactions. `--member EMAIL` adds a mentor, a conversation with an unread reply, one published recap and one recap awaiting that member's approval |

Real members' photos, covers and relationships are never changed, except the ones a
`--member` option explicitly adds.

#### 500 alumni instead of 200

The site can hold the same 500 profiles as the evaluation's scale-up (the 200 demo
alumni plus ALUM-201 to ALUM-500 from `evaluation/datasets/alumni_500`). Additive and
safe to rerun; existing people and relationships are not changed:

```bash
.venv/bin/python scripts/extend_demo_alumni.py --apply      # 300 profiles, skills, history, ~4,600 connections, registry records SYN-ALUM-201..500
.venv/bin/python scripts/index_profile_embeddings.py        # embeddings for mentor search
.venv/bin/python scripts/generate_avatars.py --apply        # portraits and covers
```

The Chapter 4 200-profile results were measured on a 200-profile database; reproduce
them on a fresh setup (which seeds 200), not on an extended one.

### Session recaps

After an accepted mentorship, either person can share a recap (topic, date and
takeaways, 20 to 1,500 characters) from `/recaps/new` or the mentorship requests page.
It stays private until the other person approves it on `/mentorship/requests`; it then
appears in `/recaps`, on both profiles ("Mentoring sessions") and on Home. Members can
mark recaps "Insightful". Only one recap per mentorship can await approval at a time,
and recaps of suspended or unverified members disappear automatically. Administrators
can hide and restore recaps at `/admin/recaps`. Migration 007 adds `session_recaps` and
`recap_reactions` without changing existing tables.

### Mentor matching: measured from real use

The language model is **BAAI/bge-base-en-v1.5** (pinned revision `a5beb1e3…`), a
pretrained sentence-embedding model run locally by the matching service. It powers:

| Feature | How the model is used |
| --- | --- |
| Mentor search (`/mentorship`) | Embeds the member's goal (with BGE's query instruction) and ranks consenting mentors by cosine similarity in pgvector |
| Mentors for you (Home) | Embeds the member's own profile and finds the most similar mentor profiles, with no search needed (`POST /mentors/recommend`) |
| Kafka re-indexing | Re-embeds a mentor's profile whenever they edit it |
| Evaluation | `scripts/evaluate_matching.py` measures P@5, R@5, F1@5 and MRR |

**Hybrid ranking experiment.** `services/matching/app/hybrid.py` re-ranks the semantic
candidates with BM25 keyword scores by reciprocal rank fusion (the similarity threshold
still decides who qualifies). It was adopted only if it matched or beat semantic ranking
on every metric. It did not: on career-transition queries it scored P@5 0.580 against
0.620 and MRR 0.683 against 0.775, because keyword overlap favours mentors who share the
member's *old* role. Live search therefore stays semantic (`MATCHING_RANKING=semantic`);
the comparison is in `evaluation/results/matching_evaluation.md` and on `/admin/matching`.

**Live measurement.** Each search records which mentors were shown and at what rank (never
the search text; deleted after 180 days). A mentorship request made from a result keeps its
origin (verified to be the member's own search and the mentor actually shown at that rank).
After a mentorship is accepted, the mentee can rate the match (1 to 5, and "would you
recommend"). `/admin/matching` shows request rate, acceptance and average rating by result
position and by how the mentor was found, next to the offline evaluation.

### Mentoring sessions

Mentors publish time slots at `/mentorship/availability` (Nairobi time, 15-minute steps,
30 to 90 minutes, no overlaps). The mentee of an accepted mentorship books one from
"Book a session"; a row lock makes double-booking impossible. Both people get an in-app
notification and an email with a calendar invitation (`.ics`), and can download it again
from `/mentorship/sessions`. Either person can cancel before it starts: a mentee's
cancellation reopens the slot, a mentor's withdraws it. Past sessions lead to "Share a
recap" and "Rate this match".

### Privacy and data (Kenya Data Protection Act 2019)

`/account/privacy` lets a member hide from the directory, show their full profile to
connections only (others see name, headline and photo), choose emails (weekly digest is
opt-in; session emails can be turned off), download all their data as JSON, and delete
their account (password re-entry for password accounts; typing DELETE). Every choice is
stored in `privacy_consents` with the date and policy version. Deletion removes everything
that belongs to the member and releases their staff-registry record so they can rejoin.

### Administration: insights, health and audit

`/admin/analytics` and `/admin/matching` redirect to the two Insights tabs.

| Page | Shows |
| --- | --- |
| `/admin/insights` (**Insights › Community**) | Members, connections, mentorships, acceptance rate, median reply time, recaps and sessions; monthly charts and department participation (aggregates only) |
| `/admin/insights?view=matching` (**Insights › Match quality**) | Live match quality and the offline evaluation |
| `/admin/health` | Database, matching service, search index coverage, Kafka and re-indexing backlog, SMTP, each with a plain-language fix |
| `/admin/audit` | Every administrative action and account deletion. The table is append-only: a database trigger rejects edits and deletes |

Admin changes and their audit entries are written in the same SQL statement, so one
cannot happen without the other.

### Email worker

```powershell
.venv/Scripts/python.exe scripts/run_notifications.py            # every minute: reminders, Monday digest, retention
.venv/Scripts/python.exe scripts/run_notifications.py --once --digest-now
```

Reminders go to both people 24 hours before a session; the weekly digest goes on Monday
mornings (Nairobi) to members who opted in. The `email_deliveries` ledger ensures nothing
is sent twice, and a failed send is retried on the next pass.

## Kenya job feed

**Opportunities › Jobs in Kenya** (`/opportunities/jobs`) shows real job
listings, LinkedIn-style; `/opportunities` opens it directly. Each card
shows the logo, role, company, location or remote eligibility, type and salary
when given, when it was posted, and the source. **Apply** opens the original
listing in a new tab. Filters cover 13 career areas, remote or on-site, and free-text
search. **For you** ranks first the areas people from the member's former Kenya
Airways department most often move into (`DEPARTMENT_TOPICS` in
`src/lib/job-sources.ts`). Home's "What could come next?" shows four listings.

| Source | Key | What it adds |
| --- | --- | --- |
| [Himalayas](https://himalayas.app/api) | none | Remote roles whose location and time-zone restrictions admit applicants in Kenya (UTC+3). On by default; `JOB_FEED_HIMALAYAS=off` disables it. |
| [JobWebKenya](https://jobwebkenya.com) | none | On-site jobs at employers in Kenya, from the board's public RSS feed (10 feed pages a day, about the last 30 hours of postings). Each card shows title, company, town when stated, date and a short plain-text excerpt; **Apply** opens the JobWebKenya listing, credited on every card. Topics are inferred from job titles for **For you**. Open calls ("Submit CVs") are skipped. On by default; `JOB_FEED_JOBWEBKENYA=off` disables it. |
| JSearch (Google for Jobs, RapidAPI) | `JSEARCH_API_KEY` | On-site listings in Kenya collected from LinkedIn, BrighterMonday, Fuzu and company sites. Free plan: 200 requests a month; Lumina uses 3 a day. Not yet exercised against the live API (no key during development); check it after adding a key with **Refresh now**. |

How it works (`src/lib/job-feed.ts`, migration `009_job_feed.sql`):

- **Refresh schedule.** Listings are fetched at most once a day per source:
  - one request per career area for Himalayas (about 13) and 10 feed pages for JobWebKenya
  - a 15-second timeout and a 4 MB limit on each request
  - a fixed generic `User-Agent`, with nothing about the user
  - an advisory lock, so only one refresh runs at a time

  A page view never waits for a provider. A stale feed refreshes after the
  response (`after()`), and a failed attempt is retried after an hour. An
  administrator's **Refresh now** also runs in the background and returns at once.
- **Validation.** Provider data is untrusted and is cached in `external_jobs` as
  plain, bounded text. HTML is never stored or rendered, and links must be https.
  Apply links are `rel="noopener noreferrer nofollow"`.
- **Expiry.** Expired listings are removed on every refresh. Listings a source
  stops returning are removed after three days, but only after a complete refresh,
  so one failed request cannot empty a career area.
- **Ordering.** Every company's newest listing comes before any company's second.
- **Himalayas terms.** Himalayas is credited with a visible link, every Apply uses
  its `applicationLink`, results are cached, and expired jobs are removed.
- **Administration.** Administrators see per-source status and can force a refresh
  under **Administration › Opportunities**; the refresh is written to the audit log.
  **System health** reports the feed. Each attempt is recorded in `job_feed_runs`.

Existing databases need the migrations: `.venv/bin/python scripts/apply_migration.py 009 --apply`, then `010 --apply`
(allows the JobWebKenya source; constraint change only).
Tests: `tests/auth/job-feed.test.ts` (normalisation, sanitising, filters, provider
configuration) and `tests/auth/job-feed.database.test.ts` (storage, expiry, partial
failures, schedule, locking, ranking; needs `LUMINA_TEST_DATABASE=1`).

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
statement. Capacity and mentorship assignments remain future work. The Next.js
frontend now provides an authenticated mentorship search form and ranked cards;
LLM explanations are not implemented.

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


## Alumni Network and final branding milestone

`/network` is a real PostgreSQL-backed directory, available to active verified
alumni and active administrators. It does not use the fictional community
preview data or BGE/vector search. A GET form stores `q`, `department`,
`industry`, `skill`, `location`, and `page` in the URL. Text search covers name,
headline, former KQ role, current position and current organization. Filters
match stored department, industry, skill and location values exactly; options
come only from discoverable profiles. Text is bounded and validated server-side;
SQL values are parameterized and LIKE wildcards are escaped as literal text.

Pages contain 12 profiles, sorted by case-insensitive name and profile UUID.
Counts, previous/next controls, clear filters and empty states are included.
Out-of-range positive page numbers show the last available page. Applying the
form resets pagination; links retain all active filters. A profile return link
restores the originating Network filters and page.

Directory subjects must be alumni with an active account, verified alumni
status and a nonblank profile name. Administrators can browse but admin accounts
are not directory subjects. A completed-profile flag is not required: optional
professional fields have honest fallbacks. Pending, suspended, unverified and
blank-name profiles are hidden, including from direct UUID lookup and filter
options. Mentorship availability and matching consent are separate; opting out
of matching does not hide an otherwise discoverable professional profile.

`/alumni/[id]` is the shared professional profile view for Network, Home and
mentorship. It includes professional details, biography, service years, all
skills and work experience. Mentorship availability/topics are shown only when
both matching consent and availability are enabled. Viewer authorization and
subject visibility are checked on the server. Private identity, registry,
account-management and embedding fields are never selected for display.
Home's Explore alumni section prioritizes the viewer's former department, then
recently created profiles, with UUID tie-breaking and a maximum of three.
It excludes the viewer. This is deterministic discovery, not AI personalization.
Home's mentorship entry opens the actual query workflow without fake matches.

The supplied `public/LuminaLogo.png` (594 x 127) is rendered with `next/image`
through `LuminaLogo` throughout the landing/sign-in pages and application/admin
shell. All sizes use the same original full logo with its aspect ratio intact.
There is no fabricated compact mark. Navigation switches to a keyboard-accessible
menu at widths up to 1100px, including tablets and 1024px laptops. Escape closes
it and returns focus; account actions remain separate and accessible. Directory
cards use three columns on desktop, two up to 1100px, and one up to 700px.
Filters use four columns, then two, then one up to 600px. Forms, dialogs, skill
lists and profile layouts wrap and scroll where needed; phones use a simpler
single-column Home hero. Content width is bounded on larger displays.

### Photo migration and local demonstration

Migration `003_google_profile_image.sql` adds nullable `users.google_image_url`.
New installations include it in `database/schema.sql`. For the existing local
development database, preview/apply with:

```powershell
.venv/Scripts/python.exe scripts/migrate_profile_image.py
.venv/Scripts/python.exe scripts/migrate_profile_image.py --apply
```

The local-only runner checks existing rows and rolls back on unintended changes.
Apply migration 003 before starting this version against an existing database.
Google sign-in refreshes only a validated HTTPS googleusercontent.com photo URL
alongside existing subject-based linkage. Other users' session tokens are never
read. Earlier accounts gain a directory photo on their next Google sign-in;
missing, invalid or unavailable photos display initials. External images remain
restricted to the Google hostname allowlist and use no-referrer requests.

For the lecturer demo, sign in with Google, complete the automatic registry
verification, save a named profile, open Network, apply filters, and open a
profile. The original 50 deterministic synthetic accounts represent established
verified demo alumni. Fresh seeding creates them active and alumni-verified;
normal authentication still creates pending, unverified accounts. Browser tests create 13 disposable verified database profiles to exercise
real filtering/pagination, then remove them and compare the original data.
The live mentorship test uses the real BGE/pgvector workflow plus a disposable
verified mentor copied from an indexed synthetic record, leaving original
accounts unchanged. Synthetic database records carry an explicit demo label.

Events and Opportunities remain labeled fictional previews; community activity,
connections and messaging remain unimplemented. The prototype alumni registry
also remains synthetic, not an authorized Kenya Airways employee registry.

### Milestone validation

```powershell
$env:LUMINA_TEST_DATABASE = "1"
npm run test:auth
npm run build
npm run test:frontend:browser
npm run test:mentorship:live
npm run test:auth:http
npm run typecheck
npm run lint
.venv/Scripts/python.exe -m unittest discover -s services/matching/tests -v
git diff --check
```

The browser suite covers 320x700, 375x812, 768x1024, 1024x768 and 1440x900,
with additional Home/Network/mentorship checks at 430, 600, 900, 1280 and
1920px. Coverage includes the logo, navigation, Network filters/pagination/profile return,
mentorship states, profile editor, verification, account, admin and scrolling
dialogs. Screenshots and `browser-report.json` are saved under the ignored
`artifacts/frontend/` directory. The live mentorship report and screenshots
remain under `artifacts/frontend/mentorship-live/`.


### Established synthetic alumni fixtures

The original `ALUM-001` through `ALUM-050` dataset represents established alumni,
not new signup requests. `seed_database.py` creates those exact fixture identities
as `account_status=active`, `alumni_verified=true`. It uses the local-only database
guard and validates that the CSV contains exactly the 200 unique fixture
identifiers (ALUM-001 to ALUM-200). Reseeding replaces each fixture's work history,
so it is idempotent.
It refuses collisions with Google-linked accounts, normal password hashes,
non-alumni roles, pending or suspended accounts. No authentication defaults or
production discoverability conditions are changed.

For an existing local database, use the focused repair instead of reseeding:

```powershell
.venv/Scripts/python.exe scripts/establish_synthetic_alumni.py
.venv/Scripts/python.exe scripts/establish_synthetic_alumni.py --apply
```

The preview writes nothing. Apply runs transactionally and only verifies the exact
50 emails `alum-001@synthetic.lumina.local` through
`alum-050@synthetic.lumina.local`, additionally requiring the existing
`synthetic_not_for_login` marker, no Google subject, active status, alumni role,
and 50 existing profiles. A missing fixture or protected identity aborts the
whole repair. It never uses a broad domain suffix update, never reactivates a
suspended account, and reports aggregate before/after counts only. Repeat apply
updates zero rows. The runner verifies that all other user fields, non-fixture
users, profiles, skills, registry data, mentorship preferences and embeddings
remain unchanged. Normal Google signups and future signup implementations do
not call these development-only helpers.

The production Network rule remains active + alumni verified + usable named
profile (alumni subjects only). Mentorship consent/availability is independent;
these fixtures remain visibly labeled synthetic demo profiles.

```powershell
$env:LUMINA_TEST_DATABASE = "1"
.venv/Scripts/python.exe -m unittest discover -s tests/synthetic -v
$env:LUMINA_TEST_SYNTHETIC_DIRECTORY = "1"
npm run test:frontend:browser
```

The optional browser assertion traverses the real paginated directory and checks
that all 200 exact seeded profile IDs are present. It requires the established
local dataset; ordinary browser tests continue to work with an empty database.
