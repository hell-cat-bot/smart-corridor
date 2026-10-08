import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import useUIStore from '../../store/useUIStore';
import useSettingsStore from '../../store/useSettingsStore';
import useWorldStore from '../../store/useWorldStore';
import { UNIT_STATUS, UNIT_STATUS_LABEL, UNIT_TYPE, VEHICLE_COLOR } from '../../domain/constants';
import { formatDuration, formatMeters } from '../../utils/geo';
import { KeyValue } from '../common/ui';

const ambulanceSvg = `<svg width="40" height="24" viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="36" height="20" rx="5" fill="white" stroke="#DC2626" stroke-width="1.5"/>
  <rect x="2" y="10" width="36" height="4" fill="#DC2626"/>
  <rect x="28" y="4" width="6" height="16" rx="1.5" fill="#1F2937" opacity="0.85"/>
  <rect x="15" y="6" width="2" height="12" fill="#DC2626"/>
  <rect x="10" y="11" width="12" height="2" fill="#DC2626"/>
  <rect x="30" y="2" width="4" height="3" rx="1" fill="#EF4444"/>
  <circle cx="8" cy="1" r="2.5" fill="#111827"/><circle cx="8" cy="23" r="2.5" fill="#111827"/>
  <circle cx="32" cy="1" r="2.5" fill="#111827"/><circle cx="32" cy="23" r="2.5" fill="#111827"/>
</svg>`;

const firetruckSvg = `<svg width="44" height="24" viewBox="0 0 44 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="40" height="20" rx="5" fill="#DC2626" stroke="#991B1B" stroke-width="1.5"/>
  <rect x="2" y="11" width="40" height="2" fill="#FCD34D"/>
  <rect x="32" y="4" width="8" height="16" rx="1.5" fill="#1F2937" opacity="0.85"/>
  <rect x="8" y="7" width="20" height="10" fill="none" stroke="#FCA5A5" stroke-width="1"/>
  <line x1="14" y1="7" x2="14" y2="17" stroke="#FCA5A5" stroke-width="1"/>
  <line x1="20" y1="7" x2="20" y2="17" stroke="#FCA5A5" stroke-width="1"/>
  <rect x="34" y="2" width="3" height="3" rx="1" fill="#EF4444"/>
  <circle cx="8" cy="1" r="2.5" fill="#111827"/><circle cx="8" cy="23" r="2.5" fill="#111827"/>
  <circle cx="34" cy="1" r="2.5" fill="#111827"/><circle cx="34" cy="23" r="2.5" fill="#111827"/>
</svg>`;

const civilianSvg = `<svg width="30" height="18" viewBox="0 0 36 22" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="32" height="18" rx="5" fill="#94A3B8" stroke="#64748B" stroke-width="1.5"/>
  <rect x="10" y="4" width="18" height="14" rx="3" fill="#475569"/>
</svg>`;

export function unitSvg(type) {
  if (type === UNIT_TYPE.FIRETRUCK) return firetruckSvg;
  if (type === 'civilian') return civilianSvg;
  return ambulanceSvg;
}

const statusTone = {
  [UNIT_STATUS.AVAILABLE]: 'bg-gray-100 text-gray-600',
  [UNIT_STATUS.ASSIGNED]: 'bg-[#F3F4F6] text-[#111827]',
  [UNIT_STATUS.EN_ROUTE]: 'bg-[#DBEAFE] text-[#2563EB]',
  [UNIT_STATUS.ON_SCENE]: 'bg-[#FEF3C7] text-[#D97706]',
  [UNIT_STATUS.TRANSPORTING]: 'bg-[#DCFCE7] text-[#16A34A]',
  [UNIT_STATUS.RETURNING]: 'bg-gray-100 text-gray-500',
};

export default function UnitMarker({ unit, dimmed = false }) {
  const showMapLabels = useSettingsStore((s) => s.showMapLabels);
  const mission = useWorldStore((s) => s.missions.find((m) => m.id === unit.missionId) || null);

  const isBlocked = Boolean(unit.blocked);
  // Quantize heading so divIcon HTML is not rebuilt on every tiny rotation.
  const headingBucket = Math.round((unit.heading || 0) / 8) * 8;

  const icon = useMemo(() => {
    const dot = VEHICLE_COLOR[unit.type] ?? '#64748B';
    const onScene = unit.status === UNIT_STATUS.ON_SCENE;

    // A held unit gets a hard red halo and its own label, so a stranded vehicle
    // is obvious on the map without reading the fleet rail.
    const halo = isBlocked
      ? '<div style="position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(220,38,38,0.22);border:2px solid rgba(220,38,38,0.85);animation:disaster-pulse 1.4s ease-out infinite;"></div>'
      : onScene
        ? '<div style="position:absolute;width:34px;height:34px;border-radius:50%;background:rgba(217,119,6,0.25);animation:disaster-pulse 2s ease-out infinite;"></div>'
        : '';

    const label = isBlocked
      ? `<div style="position:absolute;top:27px;left:50%;transform:translateX(-50%);white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-size:9px;font-weight:800;padding:1.5px 7px;border-radius:9999px;background:#DC2626;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);pointer-events:none;">BLOCKED · ${unit.label}</div>`
      : showMapLabels
        ? `<div style="position:absolute;top:27px;left:50%;transform:translateX(-50%);white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-size:9px;font-weight:800;padding:1.5px 7px;border-radius:9999px;background:rgba(255,255,255,0.96);color:#0F172A;border:1px solid rgba(203,213,225,0.9);box-shadow:0 2px 6px rgba(0,0,0,0.15);display:flex;align-items:center;gap:4px;pointer-events:none;">
             <span style="width:5px;height:5px;border-radius:50%;background:${dot};"></span><span>${unit.label}</span>
           </div>`
        : '';

    return L.divIcon({
      html: `
        <div style="position:relative;width:44px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:${dimmed ? 0.35 : 1};">
          ${halo}
          <div style="transform:rotate(${headingBucket}deg);transform-origin:center;display:flex;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));">
            ${unitSvg(unit.type)}
          </div>
          ${label}
        </div>`,
      className: 'bg-transparent border-0 overflow-visible unit-marker',
      iconSize: [44, 26],
      iconAnchor: [22, 13],
      popupAnchor: [0, -14],
    });
  }, [unit.type, headingBucket, unit.label, unit.status, showMapLabels, dimmed, isBlocked]);

  if (!unit.pos) return null;

  const remaining = unit.route ? unit.route.total - unit.route.travelled : 0;

  return (
    <Marker
      position={[unit.pos.lat, unit.pos.lng]}
      icon={icon}
      zIndexOffset={500}
      eventHandlers={{
        click: (e) => {
          L.DomEvent.stopPropagation(e);
          useUIStore.setState({
            selectedNodeId: null,
            selectedUnitId: unit.id,
            selectedMissionId: unit.missionId || null,
            _suppressMapClear: true,
          });
        },
      }}
    >
      <Popup>
        <div className="min-w-[210px]">
          <div className="flex items-center justify-between border-b pb-1.5 mb-2">
            <span className="text-xs font-bold text-gray-900">{unit.label}</span>
            <span className="text-[10px] font-mono text-gray-400">{unit.id}</span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusTone[unit.status] || ''}`}>
              {UNIT_STATUS_LABEL[unit.status]}
            </span>
            {isBlocked && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                Blocked
              </span>
            )}
          </div>

          {isBlocked && (
            <p className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 mb-2 leading-snug">
              Held short of <span className="font-semibold">{unit.blocked.node}</span> — every route to the destination is
              cut. It will resume by itself once the blockage clears.
            </p>
          )}
          <KeyValue label="Type" value={unit.type === UNIT_TYPE.AMBULANCE ? 'Ambulance' : 'Fire engine'} />
          <KeyValue label="Base" value={unit.baseFacilityId || '—'} mono />
          <KeyValue label="Mission" value={unit.missionId || 'unassigned'} mono />
          {mission && <KeyValue label="Emergency" value={`${mission.emergencyLabel} · P${mission.priority}`} />}
          {unit.route && (
            <>
              <KeyValue label="Leg" value={unit.route.legType === 'return' ? 'Return to base' : unit.route.legType} />
              <KeyValue label="Remaining" value={formatMeters(remaining)} />
            </>
          )}
          {unit.status === UNIT_STATUS.ON_SCENE && (
            <KeyValue label="On-scene dwell" value={formatDuration(unit.dwellRemaining)} />
          )}
          <KeyValue label="Replans" value={unit.replanCount} />
        </div>
      </Popup>
    </Marker>
  );
}
