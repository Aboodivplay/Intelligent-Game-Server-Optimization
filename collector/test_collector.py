import json
import io
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from collector import QueueFull, Store, checked_sample, cloud_sender, make_handler, relay_one


SERVER = str(uuid4())
KEY = "b" * 64


def reading(at=None, platform="Forge"):
    at = time.time() if at is None else at
    return {"serverId": SERVER, "sampleId": str(uuid4()),
            "timestamp": datetime.fromtimestamp(at, timezone.utc).isoformat(),
            "intervalSeconds": 2, "minecraftVersion": "1.20.1", "platform": platform,
            "cpu": 17, "memory": 44, "tps": 20, "mspt": 11.7, "entities": 25, "players": 3,
            "memoryUsedMb": 900, "memoryMaxMb": 2048}


def request_in_process(handler, method, path, payload=None, token=KEY):
    """Pass an HTTP/1.0 request through the real handler without opening a network port."""
    body = json.dumps(payload).encode() if payload is not None else b""
    headers = (f"{method} {path} HTTP/1.0\r\nAuthorization: Bearer {token}\r\n"
               f"Content-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n")

    class Connection:
        def __init__(self):
            self.response = bytearray()

        def makefile(self, mode, buffering):
            return io.BytesIO(headers.encode() + body)

        def sendall(self, data):
            self.response.extend(data)

        def settimeout(self, value):
            pass

    connection = Connection()
    handler(connection, ("127.0.0.1", 0), None)
    head, response = connection.response.split(b"\r\n\r\n", 1)
    return int(head.split()[1]), json.loads(response)


class CollectorTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.path = Path(folder.name) / "data.sqlite3"
        self.store = Store(self.path, capacity=2)

    def accept(self, raw, relay=True):
        sample, timestamp = checked_sample(raw, SERVER)
        return self.store.accept(sample, timestamp, relay)

    def test_backlog_is_bounded_and_restart_preserves_order(self):
        now = time.time()
        later, earlier = reading(now), reading(now - 2, "Fabric")
        self.assertTrue(self.accept(later))
        self.assertTrue(self.accept(earlier))
        self.assertFalse(self.accept(earlier))
        with self.assertRaises(QueueFull):
            self.accept(reading())
        self.assertEqual(relay_one(self.store, SERVER, lambda _: 503), "retry")
        restarted = Store(self.path)
        delivered = []

        def upstream(body):
            delivered.append(json.loads(body)["sampleId"])
            return 201

        for _ in range(2):
            self.assertEqual(relay_one(restarted, SERVER, upstream), "next")
        self.assertEqual(delivered, [earlier["sampleId"], later["sampleId"]])
        self.assertEqual(restarted.status(SERVER)["pending"], 0)
        self.assertFalse(self.accept(later))
        self.assertEqual(self.store.status(SERVER)["samples"], 2)

    def test_late_sample_does_not_move_latest_back_and_stale_at_three_intervals(self):
        now = round(time.time(), 3)
        self.accept(reading(now), relay=False)
        self.accept(reading(now - 60), relay=False)
        self.assertFalse(self.store.status(SERVER, now+5.99)["stale"])
        self.assertTrue(self.store.status(SERVER, now+6)["stale"])
        self.assertIsNone(self.store.oldest_pending(SERVER))

    def test_bad_sample_cannot_block_following_delivery(self):
        self.accept(reading())
        self.assertEqual(relay_one(self.store, SERVER, lambda _: 422), "next")
        self.assertEqual(self.store.status(SERVER)["rejected"], 1)
        self.accept(reading())
        self.assertEqual(relay_one(self.store, SERVER, lambda _: 401), "retry")
        self.assertEqual(self.store.status(SERVER)["pending"], 1)

    def test_local_listener(self):
        handler = make_handler(self.store, SERVER, KEY, False)

        def req(method, path, payload=None, token=KEY):
            return request_in_process(handler, method, path, payload, token)

        sample = reading()
        self.assertEqual(req("POST", "/telemetry", sample, token="wrong")[0], 401)
        self.assertEqual(req("POST", "/telemetry", dict(sample, mspt=-1))[0], 400)
        self.assertEqual(req("POST", "/telemetry", dict(sample, serverId=str(uuid4())))[0], 400)
        self.assertEqual(req("GET", "/status", token="wrong")[0], 401)
        self.assertEqual(req("POST", "/telemetry", sample)[0], 201)
        self.assertEqual(req("POST", "/telemetry", sample), (200, {"received": True, "duplicate": True}))
        self.assertEqual(req("GET", "/status")[1]["latest"], sample)

    def test_insecure_cloud_target_rejected(self):
        with self.assertRaises(ValueError):
            cloud_sender("http://example.test/telemetry", KEY)


if __name__ == "__main__":
    unittest.main()
