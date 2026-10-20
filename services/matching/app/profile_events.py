"""Event-driven re-indexing: PostgreSQL outbox -> Kafka -> matching indexer.

The web app writes a row to `profile_change_outbox` in the same transaction as
any profile, skill, experience or mentorship-settings change. The relay
publishes pending rows to the `lumina.profile-changes` topic (keyed by profile,
so one profile's events stay ordered) and only then marks them published. The
consumer re-embeds the affected profiles and commits its offset only after the
database work succeeds, so a crash replays rather than loses events. Indexing
is idempotent (source hashes), so replays are harmless.
"""

import json
import logging
import threading
import time

from .indexing import BGEEncoder, index_profiles

TOPIC = "lumina.profile-changes"
GROUP = "lumina-matching-indexer"
logger = logging.getLogger("lumina.profile_events")


def relay_once(conn, producer, batch=100):
    """Publish up to `batch` pending outbox rows; returns how many were published."""
    with conn.transaction():
        rows = conn.execute("""
            SELECT id, profile_id::text, reason, created_at FROM profile_change_outbox
            WHERE published_at IS NULL ORDER BY id LIMIT %s FOR UPDATE SKIP LOCKED
        """, (batch,)).fetchall()
        if not rows:
            return 0
        futures = [producer.send(TOPIC, key=profile_id.encode(), value=json.dumps({
            "outbox_id": outbox_id, "profile_id": profile_id, "reason": reason, "created_at": created_at.isoformat(),
        }).encode()) for outbox_id, profile_id, reason, created_at in rows]
        producer.flush(timeout=30)
        for future in futures:
            future.get(timeout=30)  # Raises if Kafka did not acknowledge; the transaction then rolls back.
        conn.execute("UPDATE profile_change_outbox SET published_at = CURRENT_TIMESTAMP WHERE id = ANY(%s)",
                     ([row[0] for row in rows],))
    return len(rows)


def profile_ids_from(records):
    """Valid, de-duplicated profile ids from a batch of Kafka records; malformed events are skipped."""
    ids = []
    for record in records:
        try:
            profile_id = json.loads(record.value)["profile_id"]
            if isinstance(profile_id, str) and len(profile_id) == 36 and profile_id not in ids:
                ids.append(profile_id)
        except (ValueError, KeyError, TypeError):
            logger.warning("Skipping malformed profile-change event")
    return ids


def consume_once(conn, consumer, encoder_factory, timeout_ms=1000):
    """Re-index one polled batch; commits offsets only after indexing finishes."""
    polled = consumer.poll(timeout_ms=timeout_ms, max_records=200)
    records = [record for batch in polled.values() for record in batch]
    if not records:
        return None
    ids = profile_ids_from(records)
    counts = index_profiles(conn, encoder_factory, profile_ids=ids) if ids else {}
    consumer.commit()
    logger.info("Re-indexed %d changed profile(s): %s", len(ids), json.dumps(counts, sort_keys=True))
    return counts


def cached_encoder_factory():
    """Loads the BGE model once per worker process, on first use."""
    lock, holder = threading.Lock(), {}

    def factory():
        with lock:
            if "encoder" not in holder:
                holder["encoder"] = BGEEncoder()
            return holder["encoder"]
    return factory


def ensure_topic(bootstrap):
    from kafka.admin import KafkaAdminClient, NewTopic
    from kafka.errors import TopicAlreadyExistsError
    admin = KafkaAdminClient(bootstrap_servers=bootstrap, client_id="lumina-setup")
    try:
        admin.create_topics([NewTopic(TOPIC, num_partitions=3, replication_factor=1)])
    except TopicAlreadyExistsError:
        pass
    finally:
        admin.close()


def run(connect, bootstrap, stop=None, poll_seconds=1.0):
    """Run relay and consumer until `stop` is set. `connect` returns a new autocommit psycopg connection."""
    from kafka import KafkaConsumer, KafkaProducer
    stop = stop or threading.Event()
    ensure_topic(bootstrap)
    factory = cached_encoder_factory()

    def resilient(step, name):
        """Runs `step(conn)` until stopped; reconnects after any failure (for example a database restart)."""
        conn = None
        while not stop.is_set():
            try:
                if conn is None or conn.closed:
                    conn = connect()
                if not step(conn):
                    stop.wait(poll_seconds)
            except Exception as exc:  # Work is retried: outbox rows stay pending, offsets stay uncommitted.
                logger.error("%s error (%s); retrying", name, type(exc).__name__)
                if conn is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass
                conn = None
                stop.wait(5)
        if conn is not None:
            conn.close()

    producer = KafkaProducer(bootstrap_servers=bootstrap, acks="all", linger_ms=20, client_id="lumina-outbox-relay")
    relay = threading.Thread(target=resilient, args=(lambda conn: relay_once(conn, producer), "Outbox relay"), name="outbox-relay", daemon=True)
    relay.start()
    consumer = KafkaConsumer(TOPIC, bootstrap_servers=bootstrap, group_id=GROUP, enable_auto_commit=False,
                             auto_offset_reset="earliest", client_id="lumina-indexer")
    resilient(lambda conn: consume_once(conn, consumer, factory) is not None, "Re-indexing")
    consumer.close()
    relay.join(timeout=10)
    producer.close()
