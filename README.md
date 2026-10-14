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
