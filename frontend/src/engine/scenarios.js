/**
 * Repeatable demo seeding: load a scenario and its scripted calls / disasters
 * fire on the simulation clock, so a demo runs identically every time.
 */

import useWorldStore from '../store/useWorldStore';
import { logEvent } from '../store/useLogStore';
import { LOG_CATEGORY, SEVERITY } from '../domain/constants';
import { scenarioById } from '../data/worldSeed';
import { createMission } from './missions';
import { injectDisaster } from './disasters';
import { resetWorld, startSim } from './simulation';

let pending = [];
let watcher = null;

export function loadScenario(id, { autoStart = true } = {}) {
  const scenario = scenarioById(id);
  resetWorld();
  useWorldStore.getState().patch({ scenarioId: scenario.id });

  pending = [
    ...scenario.calls.map((c) => ({ at: c.delay ?? 0, kind: 'call', payload: c })),
    ...scenario.disasters.map((d) => ({ at: d.delay ?? 0, kind: 'disaster', payload: d })),
  ].sort((a, b) => a.at - b.at);

  logEvent({
    category: LOG_CATEGORY.SIMULATION,
    severity: SEVERITY.INFO,
    simTime: 0,
    message: `Scenario loaded: ${scenario.name}`,
    data: {
      scenario: scenario.id,
      description: scenario.description,
      scriptedCalls: scenario.calls.length,
      scriptedDisasters: scenario.disasters.length,
    },
  });

  startWatcher();
  if (autoStart && pending.length > 0) startSim();
  return scenario;
}

function startWatcher() {
  if (watcher) clearInterval(watcher);
  if (pending.length === 0) return;

  watcher = setInterval(() => {
    const { simTime } = useWorldStore.getState();
    while (pending.length && pending[0].at <= simTime) {
      const item = pending.shift();
      if (item.kind === 'call') {
        createMission({
          service: item.payload.service,
          emergencyClass: item.payload.emergencyClass,
          sceneNode: item.payload.node,
        });
      } else {
        injectDisaster({
          node: item.payload.node,
          type: item.payload.type,
          severity: item.payload.severity,
        });
      }
    }
    if (pending.length === 0) {
      clearInterval(watcher);
      watcher = null;
    }
  }, 250);
}

export function cancelScenario() {
  pending = [];
  if (watcher) clearInterval(watcher);
  watcher = null;
}
