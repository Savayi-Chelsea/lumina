"""Outbox relay and re-indexing consumer, with in-memory Kafka fakes."""
import json
import os
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from services.matching.app import profile_events

PROFILE = "11111111-1111-1111-1111-111111111111"


class FakeFuture:
    def __init__(self, error=None):
        self.error = error

    def get(self, timeout=None):
        if self.error:
            raise self.error


class FakeProducer:
    def __init__(self, error=None):
        self.sent, self.error = [], error

    def send(self, topic, key, value):
        self.sent.append((topic, key, json.loads(value)))
        return FakeFuture(self.error)

    def flush(self, timeout=None):
        pass


class FakeConn:
    """Records statements; returns queued rows for the outbox SELECT."""

    def __init__(self, rows):
        self.rows, self.statements, self.committed = rows, [], 0

    @contextmanager
    def transaction(self):
        snapshot = list(self.statements)
        try:
            yield
            self.committed += 1
        except Exception:
            self.statements = snapshot
            raise

    def execute(self, sql, params=None):
        self.statements.append((" ".join(sql.split()), params))
        return SimpleNamespace(fetchall=lambda: self.rows)


class RelayTests(unittest.TestCase):
    def test_publishes_keyed_events_then_marks_them_published(self):
        conn = FakeConn([(7, PROFILE, "skills", datetime(2026, 10, 20, tzinfo=timezone.utc))])
        producer = FakeProducer()
        self.assertEqual(profile_events.relay_once(conn, producer), 1)
        topic, key, value = producer.sent[0]
        self.assertEqual((topic, key), ("lumina.profile-changes", PROFILE.encode()))
        self.assertEqual(value["profile_id"], PROFILE)
        self.assertIn("SKIP LOCKED", conn.statements[0][0])
        self.assertTrue(conn.statements[-1][0].startswith("UPDATE profile_change_outbox SET published_at"))
        self.assertEqual(conn.statements[-1][1], ([7],))

    def test_unacknowledged_send_leaves_rows_pending(self):
        conn = FakeConn([(8, PROFILE, "profile", datetime.now(timezone.utc))])
        with self.assertRaises(RuntimeError):
            profile_events.relay_once(conn, FakeProducer(RuntimeError("broker down")))
        self.assertFalse(any(sql.startswith("UPDATE") for sql, _ in conn.statements))

    def test_nothing_pending_publishes_nothing(self):
        producer = FakeProducer()
        self.assertEqual(profile_events.relay_once(FakeConn([]), producer), 0)
        self.assertEqual(producer.sent, [])


class ConsumerTests(unittest.TestCase):
    def records(self, *values):
        return {"tp": [SimpleNamespace(value=value) for value in values]}

    def test_reindexes_unique_profiles_and_commits_after_success(self):
        consumer = SimpleNamespace(poll=lambda **_: self.records(json.dumps({"profile_id": PROFILE}).encode(), json.dumps({"profile_id": PROFILE}).encode(), b"not json"), commits=0)
        consumer.commit = lambda: setattr(consumer, "commits", consumer.commits + 1)
        with patch.object(profile_events, "index_profiles", return_value={"indexed": 1}) as index:
            self.assertEqual(profile_events.consume_once(object(), consumer, encoder_factory=None), {"indexed": 1})
        self.assertEqual(index.call_args.kwargs["profile_ids"], [PROFILE])
        self.assertEqual(consumer.commits, 1)

    def test_failed_indexing_does_not_commit_offsets(self):
        consumer = SimpleNamespace(poll=lambda **_: self.records(json.dumps({"profile_id": PROFILE}).encode()), commits=0)
        consumer.commit = lambda: setattr(consumer, "commits", consumer.commits + 1)
        with patch.object(profile_events, "index_profiles", side_effect=RuntimeError("database down")):
            with self.assertRaises(RuntimeError):
                profile_events.consume_once(object(), consumer, encoder_factory=None)
        self.assertEqual(consumer.commits, 0)

    def test_empty_poll_is_a_no_op(self):
        consumer = SimpleNamespace(poll=lambda **_: {}, commit=lambda: self.fail("must not commit"))
        self.assertIsNone(profile_events.consume_once(object(), consumer, encoder_factory=None))


@unittest.skipUnless(os.getenv("LUMINA_TEST_KAFKA") == "1", "Opt in with LUMINA_TEST_KAFKA=1 and docker compose up -d kafka")
class LiveKafkaTests(unittest.TestCase):
    def test_round_trip_through_a_real_broker(self):
        from kafka import KafkaConsumer, KafkaProducer
        bootstrap = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "127.0.0.1:9092")
        profile_events.ensure_topic(bootstrap)
        marker = f"test-{os.getpid()}-{datetime.now().timestamp()}"
        producer = KafkaProducer(bootstrap_servers=bootstrap, acks="all")
        conn = FakeConn([(1, PROFILE, marker, datetime.now(timezone.utc))])
        consumer = KafkaConsumer(profile_events.TOPIC, bootstrap_servers=bootstrap, group_id=f"lumina-test-{marker}",
                                 auto_offset_reset="earliest", consumer_timeout_ms=15000)
        self.assertEqual(profile_events.relay_once(conn, producer), 1)
        reasons = [json.loads(record.value).get("reason") for record in consumer]
        self.assertIn(marker, reasons)
        consumer.close(); producer.close()


if __name__ == "__main__":
    unittest.main()
