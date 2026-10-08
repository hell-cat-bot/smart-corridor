'use strict';

const config = require('../config');
const collector = require('../integration/mlCollector');

/**
 * What the dashboard uses to show whether the three services are actually
 * talking to each other.
 */
async function status(req, res) {
  const state = collector.getState();

  // A direct probe, so the answer does not depend on the WebSocket alone.
  let simulation = { reachable: false, error: null, simTime: null, running: null };
  try {
    const response = await fetch(`${config.mlBackendUrl.replace(/\/+$/, '')}/`, {
      signal: AbortSignal.timeout(config.collector.requestTimeoutMs),
    });
    if (response.ok) {
      const body = await response.json();
      simulation = {
        reachable: true,
        error: null,
        simTime: body.simTime ?? null,
        running: body.running ?? null,
      };
    } else {
      simulation.error = `HTTP ${response.status}`;
    }
  } catch (err) {
    simulation.error = err.name === 'TimeoutError' ? 'timed out' : err.message;
  }

  res.json({
    mlBackendUrl: config.mlBackendUrl,
    streamUrl: collector.streamUrl(),
    simulation,
    collector: state,
  });
}

module.exports = { status };
