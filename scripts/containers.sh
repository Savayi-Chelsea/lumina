#!/usr/bin/env bash
# Start, or repair, the Docker services: PostgreSQL + pgvector, Mailpit and Kafka.
#
#   bash scripts/containers.sh
#
# Containers are always recreated. In GitHub Codespaces (Docker-in-Docker) a
# restart can leave containers without their writable layer, and starting them
# fails with "RWLayer of container ... is unexpectedly nil". All data lives in
# the named volumes (lumina_postgres_data, lumina_kafka_data), which recreating
# a container never touches, so this is safe and fixes that error.
set -euo pipefail
cd "$(dirname "$0")/.."

for _ in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 1; done
docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 1; }

docker compose up -d --force-recreate --remove-orphans

printf 'Waiting for PostgreSQL'
for _ in $(seq 1 90); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' lumina-postgres 2>/dev/null)" = "healthy" ] && break
  printf '.'; sleep 2
done
echo
docker compose ps --format 'table {{.Name}}\t{{.Status}}'
