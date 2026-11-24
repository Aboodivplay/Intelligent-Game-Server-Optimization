"""Run a 60-second simulated upstream outage on the actual local HTTP/SQLite path."""

import json
import argparse
import tempfile
import threading
import time
from contextlib import closing, nullcontext
from http.client import HTTPConnection
from http.server import HTTPServer
from pathlib import Path

from collector import Store, make_handler, relay_loop
from test_collector import KEY, SERVER, reading, request_in_process


def run(in_process=False):
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / "experiment.sqlite3"
        store = Store(path, capacity=40)
        actual, expected = [], []
        start = time.monotonic()

        def upstream(body):
            if time.monotonic() - start < 60:
                return 503
            actual.append(json.loads(body)["sampleId"])
            return 201

        def start_worker(current):
            stop = threading.Event()
            thread = threading.Thread(target=relay_loop, args=(current, SERVER, upstream, stop))
            thread.start()
            return stop, thread

        handler = make_handler(store, SERVER, KEY, True)
        with (nullcontext() if in_process else HTTPServer(("127.0.0.1", 0), handler)) as http:
            if http:
                listener = threading.Thread(target=http.serve_forever)
                listener.start()
            stop, worker = start_worker(store)
            try:
                for i in range(30):
                    time.sleep(max(0, start + 2*i - time.monotonic()))
                    if i == 15:
                        stop.set()
                        worker.join()
                        stop, worker = start_worker(Store(path))
                    sample = reading(platform="Fabric" if i % 2 else "Forge")
                    if in_process:
                        assert request_in_process(handler, "POST", "/telemetry", sample)[0] == 201
                    else:
                        with closing(HTTPConnection("127.0.0.1", http.server_port, timeout=5)) as client:
                            client.request("POST", "/telemetry", json.dumps(sample),
                                           {"Content-Type": "application/json", "Authorization": "Bearer "+KEY})
                            response = client.getresponse()
                            assert response.status == 201
                            response.read()
                    expected.append(sample["sampleId"])
                peak = store.status(SERVER)["pending"]
                while len(actual) < len(expected) and time.monotonic() - start < 90:
                    time.sleep(.1)
                elapsed = time.monotonic() - start - 60
                assert peak == 30 and actual == expected
                assert store.status(SERVER)["pending"] == 0 and elapsed < 30
                print(f"60 s outage; worker restarted at 30 s; peak queue {peak}/40; "
                      f"{len(actual)} unique samples delivered in order; cleared in {elapsed:.2f} s after recovery.")
            finally:
                stop.set()
                worker.join()
                if http:
                    http.shutdown()
                    listener.join()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in-process", action="store_true", help="Use an in-memory HTTP connection")
    run(parser.parse_args().in_process)
