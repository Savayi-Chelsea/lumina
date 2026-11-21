"""Run the profile-change worker: outbox relay to Kafka plus the re-indexing consumer.

  docker compose up -d kafka
  .venv/Scripts/python.exe scripts/run_profile_events.py
"""

import logging
import os
import signal
import sys
import threading
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from local_database import local_dsn  # noqa: E402
from services.matching.app.profile_events import run  # noqa: E402


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("kafka").setLevel(logging.WARNING)
    bootstrap = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "127.0.0.1:9092")
    dsn = local_dsn()
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    logging.info("Profile-change worker started (Kafka %s)", bootstrap)
    run(lambda: psycopg.connect(dsn, autocommit=True), bootstrap, stop)


if __name__ == "__main__":
    main()
