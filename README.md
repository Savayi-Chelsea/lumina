# Lumina

Lumina is a cloud-focused alumni engagement and mentorship platform developed
for the Kenya Airways alumni project.

The platform is designed primarily for former Kenya Airways staff and supports
professional networking, mentorship discovery, communication and alumni
engagement.

## Current Development Status

Sprint I establishes the development environment, database, synthetic data
pipeline and automation required for implementation.

Current functionality includes:

- Next.js development environment
- Git and GitHub version control
- Docker and Docker Compose
- PostgreSQL 17
- pgvector
- Automated database schema creation
- Synthetic former-staff data generation
- Automated database seeding

## Technology Stack

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend and Data
- PostgreSQL
- pgvector
- Python

### Planned AI Components
- Pre-trained BGE embedding model
- Semantic similarity search using pgvector
- Pre-trained language model for grounded match explanations

No AI model is trained or fine-tuned by this project.

### DevOps / Cloud
- Git and GitHub
- Docker
- Docker Compose
- GitHub Actions
- AWS planned for deployment

## Project Structure

```text
lumina/
├── data/
│   └── synthetic_alumni.csv
├── database/
│   ├── init.sql
│   └── schema.sql
├── public/
├── scripts/
│   ├── generate_synthetic_data.py
│   ├── seed_database.py
│   └── setup.ps1
├── src/
├── .env.example
├── docker-compose.yml
├── package.json
├── requirements.txt
└── README.md