"""Live test of event-driven re-indexing: PostgreSQL outbox -> Kafka -> worker -> pgvector -> search.

  Needs: docker compose services (postgres, kafka) and the matching service on :8000.
  .venv/bin/python scripts/evaluate_event_pipeline.py

The harness creates one disposable, non-synthetic mentor (removed at the end), writes
profile changes the way the web app does (the row change and its outbox row in one
transaction), runs the real worker (scripts/run_profile_events.py) as a subprocess,
and measures when each change is published, re-embedded and visible in search.
It deliberately stops Kafka (docker stop/start lumina-kafka) and the worker to test
recovery. Other profiles' embeddings are fingerprinted before and after and must be
unchanged. Results: evaluation/results/event_pipeline/.
"""
import csv
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from local_database import local_dsn  # noqa: E402

OUT = ROOT / "evaluation/results/event_pipeline"
BASE = os.getenv("MATCHING_SERVICE_URL", "http://127.0.0.1:8000").rstrip("/")
BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "127.0.0.1:9092")
TOPIC = "lumina.profile-changes"
TIMEOUT = 90

# Three deliberately unusual specialisms: nothing in the synthetic corpus resembles them,
# so the fixture should rank first for its own topic once (and only while) it is indexed.
CONTENT = {
    "A": ("Aircraft cabin acoustics engineer", "I retrofit regional jet cabins with noise-cancellation panels and measure cabin acoustics in flight.",
          "Reducing aircraft cabin noise with acoustic retrofits"),
    "B": ("Organic honey exporter and beekeeping cooperative founder", "After aviation I founded a beekeeping cooperative in Baringo that exports organic honey to Europe.",
          "Starting an organic honey export business from a beekeeping cooperative"),
    "C": ("Hot-air balloon safari operator in the Maasai Mara", "I run hot-air balloon flights over the Maasai Mara and train balloon pilots in burner safety.",
          "How do I start a hot-air balloon safari business?"),
    "D": ("Coffee roastery owner in Nyeri", "I left the airline to roast and export specialty Nyeri coffee and run a cupping school.",
          "Opening a specialty coffee roastery and exporting Kenyan coffee"),
}


def now():
    return time.monotonic()


def post(path, body):
    request = urllib.request.Request(f"{BASE}/{path}", method="POST", headers={"Content-Type": "application/json"},
                                     data=json.dumps(body).encode())
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def rank_of(profile_id, query):
    ids = [r["profile_id"] for r in post("mentors/search", {"query": query, "top_k": 5})["results"]]
    target = str(profile_id)  # psycopg returns uuid.UUID; the API returns strings
    return ids.index(target) + 1 if target in ids else None


def wait_for(condition, timeout=TIMEOUT, interval=0.2):
    start = now()
    while now() - start < timeout:
        value = condition()
        if value:
            return now() - start, value
        time.sleep(interval)
    return None, None


class Harness:
    def __init__(self):
        self.conn = psycopg.connect(local_dsn(), autocommit=True)
        self.worker = None
        self.log_path = OUT / "worker.log"
        self.log_handle = None
        self.rows = []
        self.user_id = self.profile_id = None

    # ---------- infrastructure ----------
    def start_worker(self):
        self.log_handle = self.log_path.open("a", encoding="utf-8")
        self.worker = subprocess.Popen([sys.executable, str(ROOT / "scripts/run_profile_events.py")], cwd=ROOT,
                                       stdout=self.log_handle, stderr=subprocess.STDOUT, start_new_session=True)

    def stop_worker(self):
        if self.worker and self.worker.poll() is None:
            self.worker.send_signal(signal.SIGTERM)
            try:
                self.worker.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.worker.kill()
                self.worker.wait()
        if self.log_handle:
            self.log_handle.close()
            self.log_handle = None

    def worker_alive(self):
        return self.worker is not None and self.worker.poll() is None

    def kafka(self, action):
        subprocess.run(["docker", action, "lumina-kafka"], check=True, capture_output=True)
        if action == "start":
            from kafka import KafkaAdminClient
            def ready():
                try:
                    KafkaAdminClient(bootstrap_servers=BOOTSTRAP, request_timeout_ms=2000).close()
                    return True
                except Exception:
                    return False
            return wait_for(ready, timeout=120, interval=1)[0]
        return 0.0

    def fingerprint_others(self):
        digest = hashlib.sha256()
        for row in self.conn.execute("""SELECT profile_id::text, source_hash, indexed_at::text FROM profile_embeddings
                                        WHERE profile_id IS DISTINCT FROM %s ORDER BY profile_id""", (self.profile_id,)):
            digest.update("|".join(row).encode())
        return digest.hexdigest()

    # ---------- fixture writes (same shape as the web app's transactions) ----------
    def create_fixture(self, key):
        headline, biography, _ = CONTENT[key]
        email = f"event-eval-{uuid.uuid4().hex[:10]}@example.test"
        with self.conn.transaction():
            self.user_id = self.conn.execute("""INSERT INTO users (email, account_status, alumni_verified)
                VALUES (%s, 'active', TRUE) RETURNING id""", (email,)).fetchone()[0]
            self.profile_id = self.conn.execute("""INSERT INTO profiles (user_id, full_name, headline, biography, former_kq_role,
                former_kq_department, current_job_title, profile_completed) VALUES (%s, 'Event Pipeline Fixture', %s, %s,
                'Flight Engineer', 'Engineering & Maintenance', %s, TRUE) RETURNING id""",
                (self.user_id, headline, biography, headline)).fetchone()[0]
            self.conn.execute("""INSERT INTO mentorship_preferences (profile_id, consent_to_matching, available_for_mentorship, mentorship_topics)
                VALUES (%s, TRUE, TRUE, NULL)""", (self.profile_id,))
            outbox = self.enqueue("profile")
        return outbox

    def update_content(self, key):
        headline, biography, _ = CONTENT[key]
        with self.conn.transaction():
            self.conn.execute("UPDATE profiles SET headline = %s, biography = %s, current_job_title = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                              (headline, biography, headline, self.profile_id))
            return self.enqueue("profile")

    def set_preferences(self, consent=None, available=None):
        with self.conn.transaction():
            if consent is not None:
                self.conn.execute("UPDATE mentorship_preferences SET consent_to_matching = %s WHERE profile_id = %s", (consent, self.profile_id))
            if available is not None:
                self.conn.execute("UPDATE mentorship_preferences SET available_for_mentorship = %s WHERE profile_id = %s", (available, self.profile_id))
            return self.enqueue("mentorship")

    def enqueue(self, reason):
        return self.conn.execute("INSERT INTO profile_change_outbox (profile_id, reason) VALUES (%s, %s) RETURNING id",
                                 (self.profile_id, reason)).fetchone()[0]

    # ---------- observations ----------
    def published(self, outbox_id):
        return self.conn.execute("SELECT published_at IS NOT NULL FROM profile_change_outbox WHERE id = %s", (outbox_id,)).fetchone()[0]

    def embedding(self):
        return self.conn.execute("SELECT source_hash, indexed_at FROM profile_embeddings WHERE profile_id = %s", (self.profile_id,)).fetchone()

    def embedding_rows(self):
        return self.conn.execute("SELECT count(*) FROM profile_embeddings WHERE profile_id = %s", (self.profile_id,)).fetchone()[0]

    def record(self, scenario, check, passed, **measures):
        row = {"scenario": scenario, "check": check, "passed": bool(passed), **{k: (round(v, 3) if isinstance(v, float) else v) for k, v in measures.items()}}
        self.rows.append(row)
        print(f"{'PASS' if passed else 'FAIL'} [{scenario}] {check} {json.dumps({k: row[k] for k in measures})}")

    def propagate(self, scenario, outbox_id, query, previous_hash=None):
        """Times outbox -> Kafka publish -> new embedding -> rank 1 in search."""
        start = now()
        t_pub, _ = wait_for(lambda: self.published(outbox_id))
        t_idx, _ = wait_for(lambda: (e := self.embedding()) and e[0] != previous_hash)
        t_search, rank = wait_for(lambda: rank_of(self.profile_id, query) == 1, interval=0.5)
        total = now() - start
        self.record(scenario, "change published, re-embedded and ranked first for its topic",
                    t_pub is not None and t_idx is not None and t_search is not None,
                    publish_s=t_pub, indexed_s=t_idx, searchable_s=t_search, end_to_end_s=total)
        return (self.embedding() or [None])[0]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "worker.log").write_text("", encoding="utf-8")
    h = Harness()
    assert post("mentors/search", {"query": "aviation", "top_k": 1}) is not None, "matching service must be running"
    pending = h.conn.execute("SELECT count(*) FROM profile_change_outbox WHERE published_at IS NULL").fetchone()[0]
    assert pending == 0, f"{pending} unrelated outbox rows are pending; let the worker drain them first"
    before_others = None
    try:
        h.start_worker()
        time.sleep(3)

        # S1 creation
        outbox = h.create_fixture("A")
        before_others = h.fingerprint_others()
        current = h.propagate("S1 profile created", outbox, CONTENT["A"][2])

        # S2 update
        outbox = h.update_content("B")
        current = h.propagate("S2 profile updated", outbox, CONTENT["B"][2], current)
        h.record("S2 profile updated", "old topic no longer ranks the fixture first",
                 rank_of(h.profile_id, CONTENT["A"][2]) != 1, old_topic_rank=rank_of(h.profile_id, CONTENT["A"][2]) or "not in top 5")

        # S3 duplicate events: five outbox rows plus three raw re-deliveries of one Kafka message
        indexed_before = h.embedding()[1]
        ids = [h.enqueue("profile") for _ in range(5)]
        t_pub, _ = wait_for(lambda: all(h.published(i) for i in ids))
        from kafka import KafkaProducer
        producer = KafkaProducer(bootstrap_servers=BOOTSTRAP, acks="all")
        message = json.dumps({"outbox_id": ids[0], "profile_id": str(h.profile_id), "reason": "profile",
                              "created_at": datetime.now(timezone.utc).isoformat()}).encode()
        for _ in range(3):
            producer.send(TOPIC, key=str(h.profile_id).encode(), value=message)
        producer.flush(timeout=30)
        time.sleep(6)
        hash_after, indexed_after = h.embedding()
        h.record("S3 duplicate events", "8 duplicate events leave exactly one unchanged embedding (idempotent)",
                 t_pub is not None and h.embedding_rows() == 1 and hash_after == current and indexed_after == indexed_before,
                 duplicates_sent=8, publish_s=t_pub, embedding_rows=h.embedding_rows(), reembedded=indexed_after != indexed_before)

        # S4 malformed event followed by a real change
        producer.send(TOPIC, key=b"garbage", value=b"{not json")
        producer.flush(timeout=30)
        producer.close()
        outbox = h.update_content("C")
        current = h.propagate("S4 malformed event", outbox, CONTENT["C"][2], current)
        h.record("S4 malformed event", "worker skipped the malformed event and kept running", h.worker_alive())

        # S5 Kafka unavailable while the worker runs
        h.kafka("stop")
        outbox = h.update_content("D")
        time.sleep(20)
        stale = h.embedding()[0] == current
        h.record("S5 Kafka down at runtime", "change accepted by PostgreSQL, held in the outbox, worker stays up",
                 not h.published(outbox) and stale and h.worker_alive(), waited_s=20.0, pending=not h.published(outbox),
                 index_unchanged=stale, worker_alive=h.worker_alive())
        down_since = now()
        broker_s = h.kafka("start")
        current = h.propagate("S5 Kafka down at runtime", outbox, CONTENT["D"][2], current)
        h.record("S5 Kafka down at runtime", "no event lost after the broker returned", h.embedding()[0] == current,
                 broker_restart_s=broker_s, recovery_after_restart_s=now() - down_since)

        # S6 worker down: the outbox keeps the backlog until it returns
        h.stop_worker()
        outbox = h.update_content("A")
        time.sleep(5)
        h.record("S6 worker down", "change waits in the outbox while no worker runs", not h.published(outbox), waited_s=5.0)
        h.start_worker()
        current = h.propagate("S6 worker down", outbox, CONTENT["A"][2], current)

        # S7 worker started while Kafka is down
        h.stop_worker()
        h.kafka("stop")
        h.start_worker()
        time.sleep(20)
        survived = h.worker_alive()
        h.record("S7 worker starts while Kafka is down", "worker waits for the broker instead of exiting", survived,
                 alive_after_20s=survived, exit_code=h.worker.returncode if not survived else "")
        h.kafka("start")
        if not survived:
            h.start_worker()
        outbox = h.update_content("B")
        current = h.propagate("S7 worker starts while Kafka is down", outbox, CONTENT["B"][2], current)

        # S8 consent withdrawal and renewal
        outbox = h.set_preferences(consent=False)
        hidden_s, _ = wait_for(lambda: rank_of(h.profile_id, CONTENT["B"][2]) is None, interval=0.5)
        removed_s, _ = wait_for(lambda: h.embedding_rows() == 0)
        h.record("S8 consent withdrawn", "hidden from search and embedding deleted", hidden_s is not None and removed_s is not None,
                 hidden_from_search_s=hidden_s, embedding_deleted_s=removed_s)
        outbox = h.set_preferences(consent=True)
        current = h.propagate("S8 consent renewed", outbox, CONTENT["B"][2])

        # S9 availability: filtered at query time, embedding kept
        h.set_preferences(available=False)
        hidden_s, _ = wait_for(lambda: rank_of(h.profile_id, CONTENT["B"][2]) is None, interval=0.2)
        time.sleep(3)
        h.record("S9 unavailable", "hidden from search immediately; embedding kept for when they return",
                 hidden_s is not None and h.embedding_rows() == 1, hidden_from_search_s=hidden_s, embedding_kept=h.embedding_rows() == 1)
        h.set_preferences(available=True)
        back_s, _ = wait_for(lambda: rank_of(h.profile_id, CONTENT["B"][2]) == 1, interval=0.2)
        h.record("S9 available again", "returns to search without re-embedding", back_s is not None, visible_again_s=back_s)
    finally:
        h.stop_worker()
        if subprocess.run(["docker", "inspect", "-f", "{{.State.Running}}", "lumina-kafka"], capture_output=True, text=True).stdout.strip() != "true":
            h.kafka("start")
        if h.user_id:
            after_others = h.fingerprint_others() if before_others else None
            h.conn.execute("DELETE FROM users WHERE id = %s", (h.user_id,))
            residue = h.conn.execute("SELECT (SELECT count(*) FROM profiles WHERE id = %s) + (SELECT count(*) FROM profile_change_outbox WHERE profile_id = %s)",
                                     (h.profile_id, h.profile_id)).fetchone()[0]
            h.record("Cleanup", "fixture removed; every other embedding unchanged", residue == 0 and after_others == before_others,
                     residue_rows=residue, other_embeddings_unchanged=after_others == before_others)
        h.conn.close()
    passed = all(r["passed"] for r in h.rows)
    fields = sorted({k for r in h.rows for k in r}, key=lambda k: (k not in ("scenario", "check", "passed"), k))
    with (OUT / "scenarios.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(h.rows)
    latencies = [r["end_to_end_s"] for r in h.rows if isinstance(r.get("end_to_end_s"), (int, float))]
    summary = {"evaluated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "checks": len(h.rows),
               "passed": sum(r["passed"] for r in h.rows), "all_passed": passed,
               "propagations_measured": len(latencies),
               "end_to_end_seconds": {"min": min(latencies), "median": sorted(latencies)[len(latencies) // 2], "max": max(latencies)} if latencies else None}
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
