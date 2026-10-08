import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import useWorldStore from '../../store/useWorldStore';
import useUIStore from '../../store/useUIStore';
import useSettingsStore from '../../store/useSettingsStore';
import RoadsLayer from './RoadsLayer';
import NodesLayer from './NodesLayer';
import UnitMarker from './UnitMarker';
import FacilityMarker from './FacilityMarker';
import DisasterMarker from './DisasterMarker';
import RouteLayer from './RouteLayer';
import MapLegend from './MapLegend';
import { Eye } from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function FlyToFocus() {
  const map = useMap();
  const focusUnitId = useUIStore((s) => s.focusUnitId);
  const previous = useRef(null);

  useEffect(() => {
    if (!focusUnitId || focusUnitId === previous.current) return;
    previous.current = focusUnitId;
    const unit = useWorldStore.getState().units.find((u) => u.id === focusUnitId);
    if (unit?.pos) map.panTo([unit.pos.lat, unit.pos.lng], { animate: true, duration: 0.7 });
  }, [focusUnitId, map]);

  return null;
}

function BackgroundClick() {
  const clearSelection = useUIStore((s) => s.clearSelection);
  useMapEvents({
    click: () => {
      // Marker handlers set this so a canvas hit on the same gesture does not
      // immediately wipe the selection they just opened.
      if (useUIStore.getState()._suppressMapClear) {
        useUIStore.setState({ _suppressMapClear: false });
        return;
      }
      clearSelection();
    },
  });
  return null;
}

/** Isolates fleet marker and route re-renders so the main map does not reconcile 1000+ layers on every tick */
function FleetAndRoutesLayer() {
  const units = useWorldStore((s) => s.units);
  const missions = useWorldStore((s) => s.missions);
  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const selectedMissionId = useUIStore((s) => s.selectedMissionId);

  const selectedMission = missions.find((m) => m.id === selectedMissionId) || null;
  const highlightUnitId = selectedUnitId || selectedMission?.unitId || null;
  const hasSelection = Boolean(highlightUnitId);

  return (
    <>
      {units
        .filter((u) => u.route)
        .map((u) => (
          <RouteLayer
            key={`route-${u.id}`}
            unit={u}
            selected={highlightUnitId === u.id}
            dimmed={hasSelection && highlightUnitId !== u.id}
          />
        ))}

      {units.map((u) => (
        <UnitMarker key={u.id} unit={u} dimmed={hasSelection && highlightUnitId !== u.id} />
      ))}
    </>
  );
}

function CiviliansLayer() {
  const civilians = useWorldStore((s) => s.civilians);
  const showCivilians = useSettingsStore((s) => s.showCivilians);
  if (!showCivilians) return null;

  return (
    <>
      {civilians.map((c) =>
        c.pos ? (
          <CircleMarker
            key={c.id}
            center={[c.pos.lat, c.pos.lng]}
            radius={2.5}
            pathOptions={{
              color: '#64748B',
              fillColor: '#94A3B8',
              fillOpacity: 0.8,
              weight: 0.5,
              interactive: false,
            }}
          />
        ) : null,
      )}
    </>
  );
}

function FacilitiesLayer() {
  const facilities = useWorldStore((s) => s.facilities);
  const showFacilities = useSettingsStore((s) => s.showFacilities);
  if (!showFacilities) return null;
  return facilities.map((f) => <FacilityMarker key={f.id} facility={f} />);
}

function DisastersLayer() {
  const disasters = useWorldStore((s) => s.disasters);
  return disasters.map((d) => <DisasterMarker key={d.id} disaster={d} />);
}

/** Live operations map: network, facilities, disasters, routes and units. */
export default function OperationsMap() {
  const center = useWorldStore((s) => s.center);
  const zoom = useWorldStore((s) => s.zoom);

  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const selectedMissionId = useUIStore((s) => s.selectedMissionId);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const hasSelection = Boolean(selectedUnitId || selectedMissionId);

  return (
    <div className="relative h-full w-full">
      <MapLegend />

      {hasSelection && (
        <button
          onClick={clearSelection}
          className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-md border border-[#E5E7EB] shadow-md px-3.5 py-2 rounded-xl text-xs font-bold text-gray-800 hover:bg-gray-50 flex items-center gap-2"
        >
          <Eye className="w-4 h-4 text-[#111827]" />
          Show all active routes
        </button>
      )}

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

        <FlyToFocus />
        <BackgroundClick />

        <RoadsLayer />
        <NodesLayer />
        <CiviliansLayer />
        <FacilitiesLayer />
        <DisastersLayer />
        <FleetAndRoutesLayer />
      </MapContainer>
    </div>
  );
}
