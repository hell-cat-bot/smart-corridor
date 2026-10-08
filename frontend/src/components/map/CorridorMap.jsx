import React, { useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import useWorldStore from '../../store/useWorldStore';
import useCorridorStore from '../../store/useCorridorStore';
import TrafficLightMarker from './TrafficLightMarker';
import { unitSvg } from './UnitMarker';
import { VEHICLE_COLOR, UNIT_TYPE } from '../../domain/constants';

function AutoFitCorridor({ vehicles }) {
  const map = useMap();
  const fittedRef = useRef(null);

  useEffect(() => {
    if (!vehicles || vehicles.length === 0) {
      fittedRef.current = null;
      return;
    }
    const key = vehicles.map((v) => v.id).join(',');
    if (fittedRef.current === key) return;
    fittedRef.current = key;

    const allCoords = vehicles.flatMap((v) => v.coords || []);
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [vehicles, map]);

  return null;
}

function vehicleIcon(vehicle) {
  const color = VEHICLE_COLOR[vehicle.type] ?? '#DC2626';
  const holding = vehicle.state === 'holding';
  return L.divIcon({
    html: `
      <div style="position:relative;width:46px;height:28px;display:flex;align-items:center;justify-content:center;">
        ${holding ? '<div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(220,38,38,0.22);animation:disaster-pulse 1.4s ease-out infinite;"></div>' : ''}
        <div style="transform:rotate(${vehicle.heading || 0}deg);display:flex;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));">${unitSvg(vehicle.type)}</div>
        <div style="position:absolute;top:28px;left:50%;transform:translateX(-50%);white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-size:8.5px;font-weight:800;padding:1px 6px;border-radius:9999px;background:rgba(255,255,255,0.96);color:#0F172A;border:1px solid rgba(203,213,225,0.9);display:flex;gap:4px;align-items:center;">
          <span style="width:5px;height:5px;border-radius:50%;background:${color};"></span>${vehicle.label}${holding ? ' · HOLD' : ''}
        </div>
      </div>`,
    className: 'bg-transparent border-0 overflow-visible unit-marker',
    iconSize: [46, 28],
    iconAnchor: [23, 14],
  });
}

export default function CorridorMap() {
  const center = useWorldStore((s) => s.center);
  const zoom = useWorldStore((s) => s.zoom);
  const vehicles = useCorridorStore((s) => s.vehicles);
  const lights = useCorridorStore((s) => s.lights);

  const corridorNodes = useMemo(() => {
    const wanted = new Set(vehicles.flatMap((v) => v.path));
    // Snapshot junctions once per vehicle set — congestion churn must not re-render this map.
    return useWorldStore.getState().nodes.filter((n) => wanted.has(n.id));
  }, [vehicles]);

  // The frozen path already carries its measured road polyline.
  const paths = useMemo(
    () =>
      vehicles.map((v) => ({
        id: v.id,
        color: v.type === UNIT_TYPE.FIRETRUCK ? '#EA580C' : '#DC2626',
        positions: v.coords ?? [],
        label: v.label,
      })),
    [vehicles],
  );

  return (
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom || 15}
        preferCanvas={true}
        className="h-full w-full z-0"
        zoomControl={false}
      >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <AutoFitCorridor vehicles={vehicles} />

      {/* Only the junctions on the corridor are drawn — the rest is noise here. */}
      {corridorNodes.map((n) => (
        <CircleMarker
          key={n.id}
          center={[n.lat, n.lng]}
          radius={3.5}
          pathOptions={{ color: '#CBD5E1', fillColor: '#E2E8F0', fillOpacity: 0.9, weight: 1, interactive: false }}
        />
      ))}

      {paths.map((p) => (
        <Polyline key={p.id} positions={p.positions} pathOptions={{ color: p.color, weight: 5, opacity: 0.55, lineCap: 'round' }}>
          <Tooltip sticky>
            <span className="text-[11px] font-semibold" style={{ color: p.color }}>
              {p.label} · frozen corridor path
            </span>
          </Tooltip>
        </Polyline>
      ))}

      {Object.values(lights).map((light) => (
        <TrafficLightMarker key={light.nodeId} light={light} vehicles={vehicles} />
      ))}

      {vehicles.map((v) =>
        v.pos && v.pos.lat != null ? (
          <Marker key={v.id} position={[v.pos.lat, v.pos.lng]} icon={vehicleIcon(v)} zIndexOffset={800} />
        ) : null,
      )}
    </MapContainer>
  );
}
