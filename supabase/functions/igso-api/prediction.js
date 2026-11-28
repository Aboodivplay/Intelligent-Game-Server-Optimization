import model from './crash-model.json' with { type: 'json' };

const stepMs = model.stepSeconds * 1000;
const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, x))));

// Rows of each saved Keras matrix correspond to inputs, columns to outputs.
function addProjection(output, input, weights) {
  for (let i = 0; i < input.length; i++) {
    const row = weights[i];
    for (let j = 0; j < output.length; j++) output[j] += input[i] * row[j];
  }
}

function scoreWindow(window) {
  const units = model.recurrentKernel.length;
  const memory = new Float64Array(units);
  const hidden = new Float64Array(units);
  for (const sample of window) {
    const normalized = model.fields.map((field, i) => (sample[field] - model.mean[i]) / model.scale[i]);
    const gates = model.gateBias.slice();
    addProjection(gates, normalized, model.inputKernel);
    addProjection(gates, hidden, model.recurrentKernel);
    // Keras stores the input, forget, candidate and output gates in this order.
    for (let j = 0; j < units; j++) {
      memory[j] = sigmoid(gates[units+j]) * memory[j] + sigmoid(gates[j]) * Math.tanh(gates[2*units+j]);
      hidden[j] = sigmoid(gates[3*units+j]) * Math.tanh(memory[j]);
    }
  }
  const features = model.hiddenBias.slice();
  addProjection(features, hidden, model.hiddenKernel);
  let score = model.outputBias;
  for (let i = 0; i < features.length; i++) score += Math.max(0, features[i]) * model.outputKernel[i];
  return sigmoid(score);
}

export function predictServerRisk(readings, server, now = Date.now()) {
  const info = { modelVersion: model.version, horizonMinutes: model.horizonMinutes, required: model.steps };
  if (!server?.online || !readings.length) return { ...info, state: 'offline' };
  const last = readings.at(-1);
  const end = Date.parse(last.timestamp);
  const interval = last.intervalSeconds;
  if (!Number.isInteger(interval) || interval < 1 || interval > 5 || !Number.isFinite(end) ||
      now - end >= 3000 * interval || end - now > 5000) return { ...info, state: 'offline' };
  if (server.loader !== last.platform || (server.minecraftVersion && server.minecraftVersion !== last.minecraftVersion)) {
    return { ...info, state: 'version_mismatch' };
  }

  // Start a fresh window after a gap, a change of configuration, or a missing measurement.
  const recent = [];
  let next = end;
  for (let i = readings.length - 1; i >= 0; i--) {
    const row = readings[i];
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time) || (recent.length && time >= next) ||
        next-time > interval*1600 + 250 || row.platform !== last.platform ||
        row.minecraftVersion !== last.minecraftVersion || row.intervalSeconds !== interval ||
        !model.fields.every(key => Number.isFinite(row[key]))) break;
    recent.push({ time, row });
    next = time;
    if (time <= end - (model.steps - 1)*stepMs) break;
  }
  const available = recent.length ? Math.min(model.steps, 1 + Math.floor((end-next)/stepMs)) : 0;
  if (available < model.steps) return { ...info, state: 'collecting', available };

  // Agents can send every 1–5 seconds. Choose the nearest measured row to each training timestamp.
  recent.reverse();
  const window = [];
  let index = 0;
  for (let n = 0; n < model.steps; n++) {
    const time = end - (model.steps-1-n)*stepMs;
    while (index+1 < recent.length && Math.abs(recent[index+1].time-time) < Math.abs(recent[index].time-time)) index++;
    window.push(recent[index].row);
  }
  const score = scoreWindow(window);
  const threshold = server.threshold / 100;
  return { ...info, state: 'ready', score, threshold, elevated: score >= threshold, observedAt: last.timestamp };
}
