import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import useWorldStore from '../../store/useWorldStore';
import { LIGHT_STATE, LIGHT_STATE_LABEL } from '../../domain/constants';
import { KeyValue, Badge } from '../common/ui';

const lampOn = {
  [LIGHT_STATE.NORMAL_GREEN]: 'green',
  [LIGHT_STATE.PREEMPT_GREEN]: 'green',
  [LIGHT_STATE.RELEASING]: 'amber',
  [LIGHT_STATE.NORMAL_RED]: 'red',
};

const colors = { red: '#DC2626', amber: '#F59E0B', green: '#22C55E' };

function head(state, preempt) {
  const on = lampOn[state] || 'red';
  const lamp = (which) => {
    const active = on === which;
    return `<span style="width:6px;height:6px;border-radius:50%;background:${active ? colors[which] : '#1F2937'};box-shadow:${active ? `0 0 6px ${colors[which]}` : 'none'};display:block;"></span>`;
  };
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px;border-radius:4px;background:#111827;border:1.5px solid ${preempt ? '#22C55E' : '#374151'};box-shadow:0 2px 5px rgba(0,0,0,0.4);">
      ${lamp('red')}${lamp('amber')}${lamp('green')}
    </div>`;
}

export default function TrafficLightMarker({ light, vehicles }) {
  const node = useWorldStore((s) => s.nodes.find((n) => n.id === light.nodeId));
  const preempt = light.state === LIGHT_STATE.PREEMPT_GREEN;

  const icon = useMemo(
    () =>
      L.divIcon({
        html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          ${preempt ? '<div style="position:absolute;top:-6px;width:34px;height:34px;border-radius:50%;background:rgba(34,197,94,0.25);animation:disaster-pulse 1.6s ease-out infinite;"></div>' : ''}
          <div style="position:relative;z-index:2;">${head(light.state, preempt)}</div>
          ${
            light.servingVehicleId
              ? `<div style="margin-top:2px;white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-size:8px;font-weight:800;padding:1px 5px;border-radius:9999px;background:#16A34A;color:white;">${light.servingVehicleId}</div>`
              : ''
          }
          ${
            light.contested
              ? '<div style="margin-top:2px;white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-size:8px;font-weight:800;padding:1px 5px;border-radius:9999px;background:#A21CAF;color:white;">CONTESTED</div>'
              : ''
          }
        </div>`,
        className: 'bg-transparent border-0 overflow-visible',
        iconSize: [22, 30],
        iconAnchor: [11, 15],
        popupAnchor: [0, -16],
      }),
    [light.state, light.servingVehicleId, light.contested, preempt],
  );

  if (!node) return null;

  const queued = (light.queue || [])
    .map((id) => vehicles.find((v) => v.id === id)?.label || id)
    .join(', ');

  return (
    <Marker position={[node.lat, node.lng]} icon={icon} zIndexOffset={700}>
      <Popup>
        <div className="min-w-[190px]">
          <div className="flex items-center justify-between border-b pb-1.5 mb-2">
            <span className="text-xs font-bold text-gray-900">{node.name}</span>
            <span className="text-[10px] font-mono text-gray-400">{light.nodeId}</span>
          </div>
          <Badge tone={preempt ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
            {LIGHT_STATE_LABEL[light.state]}
          </Badge>
          <div className="mt-2">
            <KeyValue label="Serving" value={light.servingVehicleId || '—'} mono />
            <KeyValue label="Held for" value={light.since ? `${Math.max(0, light.sinceElapsed ?? 0).toFixed(0)}s` : '—'} />
            <KeyValue label="Queued" value={queued || 'none'} />
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
