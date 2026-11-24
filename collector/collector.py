"""Loopback telemetry receiver for one Forge or Fabric server. Python 3.10+."""

import argparse
import hmac
import json
import math
import re
import sqlite3
import sys
import threading
import time
from contextlib import closing
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


class QueueFull(Exception):
    pass


def checked_sample(raw, server_id):
    """Keep aggregate measurements only. Use the sampling time, even during retries."""
    if not isinstance(raw, dict) or raw.get("serverId") != server_id:
        raise ValueError("Wrong server ID")
    sample = {"serverId": server_id, "sampleId": str(UUID(raw["sampleId"]))}
    timestamp = datetime.fromisoformat(raw["timestamp"].replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("Timestamp needs a timezone")
    captured = timestamp.timestamp()
    if not 0 < captured <= time.time() + 60:
        raise ValueError("Invalid sample time")
    sample["timestamp"] = raw["timestamp"]
    for field, maximum in {"cpu": 100, "memory": 100, "tps": 20, "mspt": 3600000,
                           "entities": 10000000, "players": 1000000, "intervalSeconds": 5,
                           "memoryUsedMb": 1000000000, "memoryMaxMb": 1000000000}.items():
        value = raw[field]
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= maximum:
            raise ValueError(f"Invalid {field}")
        if field in ("entities", "players", "intervalSeconds") and type(value) is not int:
            raise ValueError(f"Expected a whole number for {field}")
        sample[field] = value
    if sample["intervalSeconds"] < 1 or raw["platform"] not in ("Fabric", "Forge"):
        raise ValueError("Invalid sample interval or platform")
    if not re.fullmatch(r"\d{1,3}\.\d{1,3}(\.\d{1,3})?", raw["minecraftVersion"]):
        raise ValueError("Invalid game version")
    sample.update(platform=raw["platform"], minecraftVersion=raw["minecraftVersion"])
    return sample, captured


class Store:
    def __init__(self, path, capacity=300):
        self.path, self.capacity = path, capacity
        with closing(sqlite3.connect(path)) as db:
            db.execute("pragma journal_mode = WAL")
            db.executescript("""
                create table if not exists samples (
                    server_id text not null, sample_id text not null,
                    captured real not null, payload text not null, state text not null,
                    primary key (server_id, sample_id)
                );
                create index if not exists sample_time on samples(server_id, captured);
                create index if not exists delivery_queue on samples(server_id, state, captured);
            """)

    def accept(self, sample, captured, relay):
        server_id = sample["serverId"]
        payload = json.dumps(sample, separators=(",", ":"))
        with closing(sqlite3.connect(self.path)) as db, db:
            # Check the limit and save under the same lock, before acknowledging the agent.
            db.execute("begin immediate")
            exists = db.execute("select 1 from samples where server_id=? and sample_id=?",
                                (server_id, sample["sampleId"])).fetchone()
            if exists:
                return False
            if relay:
                pending = db.execute("select count(*) from samples where server_id=? and state='pending'",
                                     (server_id,)).fetchone()[0]
                if pending >= self.capacity:
                    raise QueueFull
            db.execute("insert into samples values(?,?,?,?,?)",
                       (server_id, sample["sampleId"], captured, payload, "pending" if relay else "local"))
        return True

    def oldest_pending(self, server_id):
        with closing(sqlite3.connect(self.path)) as db:
            return db.execute("""select sample_id, payload from samples where server_id=? and state='pending'
                                 order by captured, sample_id limit 1""", (server_id,)).fetchone()

    def mark(self, server_id, sample_id, state):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("update samples set state=? where server_id=? and sample_id=? and state='pending'",
                       (state, server_id, sample_id))

    def status(self, server_id, now=None):
        with closing(sqlite3.connect(self.path)) as db:
            counts = dict(db.execute("select state,count(*) from samples where server_id=? group by state",
                                     (server_id,)))
            row = db.execute("select captured,payload from samples where server_id=? order by captured desc limit 1",
                             (server_id,)).fetchone()
        latest = json.loads(row[1]) if row else None
        age = (time.time() if now is None else now) - row[0] if row else None
        return {"latest": latest, "stale": not row or age >= 3 * latest["intervalSeconds"],
                "samples": sum(counts.values()), "pending": counts.get("pending", 0),
                "rejected": counts.get("rejected", 0), "queueCapacity": self.capacity}


class NoRedirect(HTTPRedirectHandler):
    # The bearer key only belongs to the configured service.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def cloud_sender(url, key):
    endpoint = urlsplit(url)
    if endpoint.scheme != "https" or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.fragment:
        raise ValueError("The cloud endpoint must be an HTTPS telemetry URL")
    client = build_opener(NoRedirect)

    def send(payload):
        req = Request(url, data=payload.encode(), headers={"Content-Type": "application/json",
                                                         "Authorization": "Bearer " + key})
        try:
            with client.open(req, timeout=5) as response:
                return response.status
        except HTTPError as exc:
            exc.close()
            return exc.code
        except (OSError, URLError):
            return 0
    return send


def relay_one(store, server_id, send):
    row = store.oldest_pending(server_id)
    if not row:
        return "idle"
    sample_id, payload = row
    status = send(payload)
    if 200 <= status < 300:
        store.mark(server_id, sample_id, "sent")
    elif status in (400, 413, 422):
        store.mark(server_id, sample_id, "rejected")
        print(f"Upstream rejected sample {sample_id} (HTTP {status})", file=sys.stderr)
    else:
        return "retry"
    return "next"


def relay_loop(store, server_id, send, stop):
    delay = 1
    while not stop.is_set():
        try:
            result = relay_one(store, server_id, send)
        except sqlite3.Error:
            result = "retry"
        if result == "retry":
            stop.wait(delay)
            delay = min(8, delay * 2)
        else:
            delay = 1
            if result == "idle":
                stop.wait(.2)


def make_handler(store, server_id, key, relay):
    class CollectorHandler(BaseHTTPRequestHandler):
        timeout = 5

        def log_message(self, *args):
            pass

        def reply(self, status, data):
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            if status == 503:
                self.send_header("Retry-After", "2")
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            supplied = self.headers.get("Authorization", "").encode()
            if hmac.compare_digest(supplied, ("Bearer " + key).encode()):
                return True
            self.reply(401, {"error": "Agent key required"})
            return False

        def do_POST(self):
            if not self.authorized():
                return
            if self.path != "/telemetry":
                return self.reply(404, {"error": "Unknown endpoint"})
            if self.headers.get_content_type() != "application/json":
                return self.reply(415, {"error": "JSON required"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 16384:
                    return self.reply(413, {"error": "Invalid sample size"})
                sample, captured = checked_sample(json.loads(self.rfile.read(length)), server_id)
                created = store.accept(sample, captured, relay)
                return self.reply(201 if created else 200, {"received": True, "duplicate": not created})
            except QueueFull:
                return self.reply(503, {"error": "Local delivery queue full"})
            except (AttributeError, KeyError, TypeError, ValueError, OverflowError):
                return self.reply(400, {"error": "Invalid telemetry sample"})
            except sqlite3.Error:
                return self.reply(503, {"error": "Local storage unavailable"})

        def do_GET(self):
            if not self.authorized():
                return
            if self.path != "/status":
                return self.reply(404, {"error": "Unknown endpoint"})
            try:
                return self.reply(200, store.status(server_id))
            except sqlite3.Error:
                return self.reply(503, {"error": "Local storage unavailable"})
    return CollectorHandler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("config/igso.properties"))
    parser.add_argument("--db", default="igso-telemetry.sqlite3")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--capacity", type=int, default=300, help="Maximum undelivered cloud samples")
    parser.add_argument("--upstream", help="Optional HTTPS URL of the published /telemetry endpoint")
    args = parser.parse_args()
    try:
        cfg = dict(line.strip().split("=", 1) for line in args.config.read_text(encoding="utf-8-sig").splitlines()
                   if line.strip() and not line.lstrip().startswith(("#", "!")) and "=" in line)
        server_id = str(UUID(cfg["server-id"].strip()))
        key = cfg["agent-key"].strip()
        if not re.fullmatch("[a-fA-F0-9]{64}", key) or args.capacity < 1:
            raise ValueError("Expected a 64-character hex agent key and positive queue capacity")
        send = cloud_sender(args.upstream, key) if args.upstream else None
        store = Store(args.db, args.capacity)
        http = HTTPServer(("127.0.0.1", args.port), make_handler(store, server_id, key, bool(send)))
    except (KeyError, ValueError, OSError, sqlite3.Error) as exc:
        parser.exit(2, f"Cannot start collector: {exc}\n")
    stop = threading.Event()
    worker = threading.Thread(target=relay_loop, args=(store, server_id, send, stop)) if send else None
    with http:
        if worker:
            worker.start()
        print(f"Listening at http://127.0.0.1:{http.server_port}/telemetry. Cloud relay {'enabled' if send else 'disabled'}.", flush=True)
        try:
            http.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            stop.set()
            if worker:
                worker.join()


if __name__ == "__main__":
    main()
