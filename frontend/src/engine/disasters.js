/**
 * Disaster injection and clearing.
 *
 * A disaster blocks its junction outright: it is removed from the routing graph
 * (infinite cost, independent of congestion), any green wave held there is
 * dropped, and every active leg crossing it replans on the next tick.
 */

import useWorldStore from '../store/useWorldStore';
import useSettingsStore from '../store/useSettingsStore';
import { logEvent } from '../store/useLogStore';
import { NODE_STATUS, LOG_CATEGORY, SEVERITY, DISASTER_TYPES } from '../domain/constants';
import { reactToNetworkChange } from './replanning';

let disasterSeq = 0;

/**
 * A custom type carries its own label; a preset type looks its label up. Either
 * way `typeLabel` is what the operator sees and what the logs record.
 */
function labelForType(type, typeLabel) {
  if (typeLabel) return typeLabel;
  return DISASTER_TYPES.find((t) => t.id === type)?.label ?? type;
}

export function injectDisaster({ node, type = 'flood', typeLabel = null, severity = 0.8, label = null, note = '' }) {
  const store = useWorldStore.getState();
  const settings = useSettingsStore.getState();

  if (store.disasters.some((d) => d.node === node)) return null;
  if (store.disasters.length >= settings.maxDisasters) {
    logEvent({
      category: LOG_CATEGORY.DISASTER,
      severity: SEVERITY.WARNING,
      simTime: store.simTime,
      message: `Disaster rejected at ${node} — maximum of ${settings.maxDisasters} active disasters reached`,
      refs: { nodeId: node },
      data: { active: store.disasters.length },
    });
    return null;
  }

  disasterSeq += 1;
  const nodeObj = store.getNode(node);
  const resolvedTypeLabel = labelForType(type, typeLabel);

  const disaster = {
    id: `DIS-${String(disasterSeq).padStart(3, '0')}`,
    type,
    typeLabel: resolvedTypeLabel,
    node,
    severity,
    note,
    label: label || `${resolvedTypeLabel} — ${nodeObj?.name ?? node}`,
    simTime: store.simTime,
    timestamp: new Date().toISOString(),
  };

  store.addDisaster(disaster);
  store.setNodeStatus(node, NODE_STATUS.BLOCKED);

  // Any preemption held at this junction is void once the junction is impassable.
  if (store.lights[node]) store.clearLight(node);

  const affected = store.units
    .filter((u) => u.route && u.route.path.includes(node))
    .map((u) => u.id);

  logEvent({
    category: LOG_CATEGORY.DISASTER,
    severity: SEVERITY.CRITICAL,
    simTime: store.simTime,
    message: `${disaster.label} — junction ${node} blocked`,
    refs: { nodeId: node },
    data: {
      disasterId: disaster.id,
      type,
      typeLabel: resolvedTypeLabel,
      severity,
      note,
      affectedUnits: affected,
      greenWaveCleared: true,
    },
  });

  // Replan now rather than on the next tick: the operator expects the new
  // optimal path on screen the moment the blockage lands, and they are most
  // likely to be studying the map with the clock paused.
  reactToNetworkChange();

  return disaster;
}

export function clearDisasterAtNode(nodeId) {
  const store = useWorldStore.getState();
  const disaster = store.disasters.find((d) => d.node === nodeId);
  if (!disaster) return;

  store.removeDisaster(disaster.id);
  store.setNodeStatus(nodeId, NODE_STATUS.NORMAL);

  logEvent({
    category: LOG_CATEGORY.DISASTER,
    severity: SEVERITY.INFO,
    simTime: store.simTime,
    message: `${disaster.label} cleared — junction ${nodeId} back in service`,
    refs: { nodeId },
    data: { disasterId: disaster.id, activeForSeconds: Number((store.simTime - disaster.simTime).toFixed(1)) },
  });

  // Units held by this blockage get moving again immediately.
  reactToNetworkChange();
}

export function clearDisaster(id) {
  const disaster = useWorldStore.getState().disasters.find((d) => d.id === id);
  if (disaster) clearDisasterAtNode(disaster.node);
}

export function clearAllDisasters() {
  const store = useWorldStore.getState();
  const count = store.disasters.length;
  for (const d of [...store.disasters]) clearDisasterAtNode(d.node);
  if (count) {
    logEvent({
      category: LOG_CATEGORY.DISASTER,
      severity: SEVERITY.INFO,
      simTime: store.simTime,
      message: `${count} disaster(s) cleared by operator`,
      data: {},
    });
  }
}

export function resetDisasterSequence() {
  disasterSeq = 0;
}
