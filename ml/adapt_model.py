"""Adapt Ayham's saved LSTM to the six sensors on our servers and a five-minute target.

Usage: python ml/adapt_model.py <GP folder> --output <model.json>
Requires numpy, pandas and pyfive==0.4.0. Inputs in the original GP folder are read-only.
"""
import argparse
import hashlib
import json
import tempfile
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import pyfive

FEATURES = ["cpu_usage_percent", "ram_usage_percent", "tps", "mspt", "entity_count", "player_count"]
LIVE_FIELDS = ["cpu", "memory", "tps", "mspt", "entities", "players"]
WINDOW = 60
STEP_SECONDS = 5
TARGET = "crash_within_5min"
THRESHOLD = 0.8


def read_encoder(folder):
    """Keep the trained memory gates and hidden layer. Select the six measured input rows by name."""
    config = json.loads((folder / "models/config.json").read_text())
    rows = [config["features"].index(name) for name in FEATURES]
    assert config["window"] == WINDOW
    checkpoint = folder / "models/lstm_model.keras"
    with tempfile.TemporaryDirectory() as directory, zipfile.ZipFile(checkpoint) as archive:
        weights = archive.extract("model.weights.h5", directory)
        with pyfive.File(weights) as h5:
            def read(path):
                return np.array(h5["layers/" + path][:], dtype=np.float32)
            kernel = read("lstm/cell/vars/0")[rows]
            recurrent = read("lstm/cell/vars/1")
            bias = read("lstm/cell/vars/2")
            hidden = read("dense/vars/0")
            offset = read("dense/vars/1")
    assert kernel.shape == (6,128) and recurrent.shape == (32,128) and hidden.shape == (32,16)
    return kernel, recurrent, bias, hidden, offset


def sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -60, 60)))


def encode(windows, encoder):
    """Run the saved Keras LSTM with fresh state for each five-minute observation window."""
    kernel, recurrent, bias, hidden, offset = encoder
    inputs = windows @ kernel + bias
    h = np.zeros((len(windows), recurrent.shape[0]), dtype=np.float32)
    cell = np.zeros_like(h)
    for step in range(WINDOW):
        i, f, candidate, o = np.split(inputs[:, step] + h @ recurrent, 4, axis=1)
        cell = sigmoid(f) * cell + sigmoid(i) * np.tanh(candidate)
        h = sigmoid(o) * np.tanh(cell)
    return np.maximum(h @ hidden + offset, 0)


def windows_for_split(frame, mean, scale, encoder):
    encoded, targets, sessions = [], [], []
    for name, group in frame.groupby("session_id"):
        times = pd.to_datetime(group.timestamp, utc=True)
        if not times.diff().iloc[1:].eq(pd.Timedelta(seconds=STEP_SECONDS)).all():
            raise ValueError(f"Unexpected sampling gap in {name}")
        # A crash ends the session. An uneventful window needs a full future horizon to label it.
        event = np.flatnonzero(group.event_confirmed.to_numpy())
        stop = int(event[0]) if len(event) else len(group) - WINDOW
        ends = np.arange(WINDOW - 1, stop)
        if not len(ends):
            continue
        values = ((group[FEATURES].to_numpy() - mean) / scale).astype(np.float32)
        for start in range(0, len(ends), 128):
            batch = ends[start:start + 128]
            indices = batch[:, None] + np.arange(1 - WINDOW, 1)
            encoded.append(encode(values[indices], encoder))
        targets.extend(group[TARGET].to_numpy()[ends])
        sessions.extend([name] * len(ends))
    return np.concatenate(encoded), np.array(targets), np.array(sessions)


def fit_output(features, labels):
    """Fit a regularized logistic output to the five-minute labels using training sessions only."""
    mean = features.mean(axis=0, dtype=np.float64)
    scale = np.maximum(features.std(axis=0, dtype=np.float64), 1e-6)
    x = np.column_stack(((features - mean) / scale, np.ones(len(labels))))
    weights = np.zeros(x.shape[1])
    penalty = np.diag([0.001] * (x.shape[1] - 1) + [0.0])
    for _ in range(40):
        p = sigmoid(x @ weights)
        gradient = x.T @ (p - labels) / len(x) + penalty @ weights
        curvature = x.T @ ((p * (1 - p))[:, None] * x) / len(x) + penalty
        step = np.linalg.solve(curvature, gradient)
        weights -= step
        if np.max(np.abs(step)) < 1e-7:
            break
    # Fold the output scaler into one weight vector so serving uses the same calculation.
    kernel = weights[:-1] / scale
    return kernel, float(weights[-1] - mean @ kernel)


def evaluate(features, labels, sessions, head, bias):
    scores = sigmoid(features @ head + bias)
    flagged = scores >= THRESHOLD
    tp = int(np.sum(flagged & (labels == 1)))
    fp = int(np.sum(flagged & (labels == 0)))
    positives = int(labels.sum())
    order = np.argsort(-scores, kind="stable")
    ordered = labels[order]
    ends = np.flatnonzero(np.r_[np.diff(scores[order]) != 0, True])
    hits = np.cumsum(ordered)[ends]
    average_precision = (np.diff(np.r_[0, hits]) * hits / (ends + 1)).sum() / positives
    return dict(sessions=len(set(sessions)), windows=len(labels), positive_windows=positives,
                true_positive=tp, false_positive=fp, false_negative=positives-tp,
                true_negative=int(len(labels)-positives-fp), precision=tp/max(1,tp+fp),
                recall=tp/positives, average_precision=float(average_precision),
                crash_sessions_warned=len(set(sessions[flagged & (labels==1)])),
                crash_sessions=len(set(sessions[labels==1])))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.folder / "data/synthetic_telemetry.csv"
    df = pd.read_csv(source).sort_values(["session_id","timestamp"])
    if (not df.data_origin.eq("synthetic_simulation").all() or
            df.groupby("session_id").split.nunique().max() != 1 or
            df.duplicated(["session_id","timestamp"]).any()):
        raise ValueError("Check data origin, split boundaries and duplicate samples.")
    train = df[df.split == "train"]
    mean = train[FEATURES].mean().to_numpy()
    scale = train[FEATURES].std(ddof=0).replace(0,1).to_numpy()
    encoder = read_encoder(args.folder)
    x, y, sessions = windows_for_split(train, mean, scale, encoder)
    head, bias = fit_output(x, y)
    metrics = {"train": evaluate(x,y,sessions,head,bias)}
    for split in ["validation","test"]:
        x,y,sessions = windows_for_split(df[df.split == split], mean, scale, encoder)
        metrics[split] = evaluate(x,y,sessions,head,bias)
    model = dict(version="igso-lstm-5m-v1", fields=LIVE_FIELDS, steps=WINDOW, stepSeconds=STEP_SECONDS,
                 horizonMinutes=5, mean=mean.tolist(), scale=scale.tolist(),
                 inputKernel=encoder[0].tolist(), recurrentKernel=encoder[1].tolist(),
                 gateBias=encoder[2].tolist(), hiddenKernel=encoder[3].tolist(), hiddenBias=encoder[4].tolist(),
                 outputKernel=head.tolist(), outputBias=bias)
    args.output.write_text(json.dumps(model, separators=(",",":"), allow_nan=False)+"\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print("Checkpoint SHA-256:", hashlib.sha256((args.folder/"models/lstm_model.keras").read_bytes()).hexdigest())
    print("Dataset SHA-256:", hashlib.sha256(source.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
