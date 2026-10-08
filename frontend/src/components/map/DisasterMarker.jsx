import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import useWorldStore from '../../store/useWorldStore';
import useSettingsStore from '../../store/useSettingsStore';
import { clearDisasterAtNode } from '../../engine/disasters';
import { KeyValue, Button } from '../common/ui';

const glyphs = {
  flood: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M2 12C2 12 5 9 12 12C19 15 22 12 22 12"/><path d="M2 18C2 18 5 15 12 18C19 21 22 18 22 18"/></svg>`,
  landslide: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linejoin="round"><path d="M8 3L2 14H14L8 3Z"/><path d="M22 21L14 8L10 14L16 21H22Z"/></svg>`,
  earthquake: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linejoin="round"><path d="M3 12H6L9 3L15 21L18 12H21"/></svg>`,
  tsunami: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M2 12C5 12 7 9 12 9C17 9 19 12 22 12"/><path d="M2 20C5 20 7 15 12 15C17 15 19 20 22 20"/></svg>`,
  // Anything the operator typed in themselves.
  custom: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
};

const colors = {
  flood: { bg: '#2563EB', ring: 'rgba(37,99,235,0.40)' },
  landslide: { bg: '#D97706', ring: 'rgba(217,119,6,0.40)' },
  earthquake: { bg: '#DC2626', ring: 'rgba(220,38,38,0.40)' },
  tsunami: { bg: '#1E40AF', ring: 'rgba(30,64,175,0.40)' },
  custom: { bg: '#7C3AED', ring: 'rgba(124,58,237,0.40)' },
};

export default function DisasterMarker({ disaster }) {
  const node = useWorldStore((s) => s.nodes.find((n) => n.id === disaster.node));
  const showLabels = useSettingsStore((s) => s.showMapLabels);

  const tone = colors[disaster.type] || colors.custom;
  const glyph = glyphs[disaster.type] || glyphs.custom;

  const icon = useMemo(
    () =>
      L.divIcon({
        html: `
        <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;border-radius:50%;background:${tone.ring};animation:disaster-pulse 2s ease-out infinite;"></div>
          <div style="position:relative;z-index:2;width:30px;height:30px;border-radius:50%;background:${tone.bg};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.35);border:2px solid white;">${glyph}</div>
          ${
            showLabels
              ? `<div style="position:absolute;top:38px;left:50%;transform:translateX(-50%);white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-size:8.5px;font-weight:800;padding:1px 6px;border-radius:9999px;background:${tone.bg};color:white;">${disaster.label}</div>`
              : ''
          }
        </div>`,
        className: 'bg-transparent border-0 overflow-visible',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18],
      }),
    [tone, glyph, showLabels, disaster.label],
  );

  if (!node) return null;

  return (
    <Marker position={[node.lat, node.lng]} icon={icon} zIndexOffset={600}>
      <Popup>
        <div className="min-w-[200px]">
          <div className="flex items-center justify-between border-b pb-1.5 mb-2">
            <span className="text-xs font-bold text-gray-900">{disaster.label}</span>
            <span className="text-[10px] font-mono text-gray-400">{disaster.id}</span>
          </div>
          <KeyValue label="Type" value={disaster.typeLabel || disaster.type} />
          {disaster.note && <KeyValue label="Note" value={disaster.note} />}
          <KeyValue label="Junction" value={disaster.node} mono />
          <KeyValue label="Severity" value={`${Math.round(disaster.severity * 100)}%`} />
          <KeyValue label="Routing" value="Excluded (infinite cost)" />
          <Button variant="success" className="w-full mt-2" onClick={() => clearDisasterAtNode(disaster.node)}>
            Clear disaster from this junction
          </Button>
        </div>
      </Popup>
    </Marker>
  );
}
