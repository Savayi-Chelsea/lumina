$ErrorActionPreference = "Stop"

Write-Host "Starting Lumina development environment..."

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example"
}

Write-Host "Starting PostgreSQL + pgvector..."
docker compose up -d

Write-Host "Waiting for PostgreSQL to become healthy..."

do {
    Start-Sleep -Seconds 2

    $status = docker inspect `
        --format='{{.State.Health.Status}}' `
        lumina-postgres 2>$null
}
until ($status -eq "healthy")

Write-Host "PostgreSQL is healthy."

Write-Host "Generating synthetic alumni data..."
python scripts/generate_synthetic_data.py

Write-Host "Seeding database..."
python scripts/seed_database.py

Write-Host ""
Write-Host "Lumina development environment is ready."