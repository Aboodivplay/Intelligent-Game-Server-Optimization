# Five-minute Minecraft crash forecast

The private dashboard scores one server at a time. Forge or Fabric sends CPU load, Java heap usage, tick rate, milliseconds per tick, entities and players. The workspace API arranges the newest continuous readings on the five-second grid used in training. Sixty readings feed the LSTM. The Predictions tab shows the score, the operator's threshold, the model version and the timestamp of the last input. The threshold controls the on-screen status. The forecast runs when the owner requests their dashboard.

## What changed from the original model

Ayham's supplied Keras checkpoint used eight inputs and a ten-minute target. The published mods collect six of those inputs. The adaptation selects the corresponding six input-weight rows, keeps the trained recurrent gates and 16-unit hidden layer, and fits a new logistic output for the supplied five-minute labels. The pipeline fits input and output normalization on training sessions. Loaded chunks and GC pause time are excluded. The model maps dataset RAM percentage to the agent's Java heap percentage. Check that these measurements behave comparably on real servers.

The API starts a new window after a telemetry interruption or a change in loader, game version or sampling interval. Faster agents contribute the nearest observed reading to each five-second grid point. A stale, incomplete or mismatched window yields a status message. The score is experimental and has not been calibrated against actual Minecraft crashes.

## Reproduce the adaptation

Install Python, NumPy, pandas and pyfive 0.4.0 in a virtual environment. From the project root, run:

```sh
python ml/adapt_model.py "/path/to/GP" --output supabase/functions/igso-api/crash-model.json
node --test tests/prediction.test.mjs
```

The input folder must contain the original `models/lstm_model.keras`, `models/config.json` and `data/synthetic_telemetry.csv`. The adaptation reads the checkpoint tensors and uses the dataset's predefined session splits. It skips confirmed crash rows and excludes end-of-session negatives without a full five minutes of follow-up. It prints the evaluation and source checksums. The JavaScript tests check serving scores against the Python calculation for two distinct sequences.

## Synthetic evaluation at a score threshold of 0.80

| Split | Sessions | Windows | Precision | Recall | Average precision |
| --- | ---: | ---: | ---: | ---: | ---: |
| Training | 84 | 20,950 | 98.9% | 52.2% | 95.1% |
| Validation | 24 | 5,775 | 99.7% | 46.8% | 92.7% |
| Test | 12 | 2,901 | 88.2% | 49.7% | 88.8% |

The test set contained 360 positive windows. The model flagged 179 correctly, missed 181 and flagged 24 negative windows. Three of the six simulated crash sessions received at least one warning during the five minutes before the crash. Overlapping windows share readings, so 2,901 windows do not represent 2,901 independent incidents. Real-server validation, persistent prediction history and notifications are still pending.

Original checkpoint SHA-256: `6e0b8f2e3e1a73f6be37f8b32403bfb10dd1f7f9c2f67a51794f6e31171c3855`.
