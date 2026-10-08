import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import useWorldStore from '../../store/useWorldStore';
import useSettingsStore from '../../store/useSettingsStore';
import { FACILITY_TYPE, UNIT_STATUS } from '../../domain/constants';
import { KeyValue } from '../common/ui';

const hospitalGlyph = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round">
  <path d="M12 6v12M6 12h12"/></svg>`;

const stationGlyph = `<svg width="15" height="15" viewBox="0 0 24 24" fill="white" stroke="none">
  <path d="M12 2c1.6 3.2 1 5-1 7-1.4 1.4-2 2.7-2 4.2A5 5 0 0 0 17 13c0-2.4-1.2-4-2.4-5.4C13.4 6.3 12.6 4.3 12 2z"/></svg>`;

export default function FacilityMarker({ facility }) {
  const node = useWorldStore((s) => s.nodes.find((n) => n.id === facility.node));
  // Only re-render when this station's occupancy/status mix changes.
  const unitSummary = useWorldStore((s) => {
    let available = 0;
    let total = 0;
    for (const u of s.units) {
      if (u.baseFacilityId !== facility.id) continue;
      total += 1;
      if (u.status === UNIT_STATUS.AVAILABLE) available += 1;
    }
    return `${total}:${available}`;
  });
  const showLabels = useSettingsStore((s) => s.showMapLabels);

  const isHospital = facility.type === FACILITY_TYPE.HOSPITAL;
  const color = isHospital ? '#0F766E' : '#B45309';

  const icon = useMemo(
    () =>
      L.divIcon({
        html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="width:26px;height:26px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white;">
            ${isHospital ? hospitalGlyph : stationGlyph}
          </div>
          ${
            showLabels
              ? `<div style="margin-top:3px;white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-size:8.5px;font-weight:800;padding:1px 6px;border-radius:9999px;background:rgba(255,255,255,0.95);color:${color};border:1px solid ${color}33;">${facility.short}</div>`
              : ''
          }
        </div>`,
        className: 'bg-transparent border-0 overflow-visible',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -14],
      }),
    [color, isHospital, showLabels, facility.short],
  );

  if (!node) return null;

  const [total, available] = unitSummary.split(':').map(Number);
  const units = useWorldStore.getState().units.filter((u) => u.baseFacilityId === facility.id);

  return (
    <Marker position={[node.lat, node.lng]} icon={icon} zIndexOffset={300}>
      <Popup>
        <div className="min-w-[200px]">
          <div className="flex items-center justify-between border-b pb-1.5 mb-2">
            <span className="text-xs font-bold text-gray-900">{facility.name}</span>
            <span className="text-[10px] font-mono text-gray-400">{facility.id}</span>
          </div>
          <KeyValue label="Type" value={isHospital ? 'Hospital' : 'Fire station'} />
          <KeyValue label="Junction" value={facility.node} mono />
          <KeyValue label="Units based here" value={`${available} available / ${total}`} />
          <div className="mt-2 flex flex-wrap gap-1">
            {units.map((u) => (
              <span key={u.id} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium">
                {u.id}
              </span>
            ))}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
