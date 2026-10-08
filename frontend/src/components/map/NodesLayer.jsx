import React, { useMemo, useState, useCallback } from 'react';
import { CircleMarker, Tooltip, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

import useWorldStore from '../../store/useWorldStore';
import useSettingsStore from '../../store/useSettingsStore';
import useUIStore from '../../store/useUIStore';
import { clearDisasterAtNode } from '../../lib/simControl';
import { NODE_STATUS, LIGHT_STATE, LIGHT_STATE_LABEL } from '../../domain/constants';
import { Button, KeyValue, Meter } from '../common/ui';
import { X } from 'lucide-react';

function nodeAppearance(node, light, isBlocked) {
  if (isBlocked) return { fill: '#DC2626', stroke: '#991B1B', radius: 9, opacity: 0.95 };
  if (light && (light.state === LIGHT_STATE.PREEMPT_GREEN || light.state === LIGHT_STATE.RELEASING)) {
    return { fill: '#22C55E', stroke: '#15803D', radius: 8, opacity: 0.95 };
  }
  if (node.status === NODE_STATUS.CONGESTED) return { fill: '#EA580C', stroke: '#9A3412', radius: 7, opacity: 0.9 };
  return { fill: '#64748B', stroke: '#334155', radius: 4.5, opacity: 0.65 };
}

/** Content rendered inside the single shared popup — reads live store values. */
function NodePopupContent({ nodeId }) {
  const node = useWorldStore((s) => s.nodes.find((n) => n.id === nodeId));
  const light = useWorldStore((s) => s.lights[nodeId]);
  const disasters = useWorldStore((s) => s.disasters);
  const facility = useWorldStore((s) => s.facilities.find((f) => f.node === nodeId));
  const units = useWorldStore((s) => s.units);

  const openDisasterDialog = useUIStore((s) => s.openDisasterDialog);
  const openMissionDialog = useUIStore((s) => s.openMissionDialog);
  const clearSelection = useUIStore((s) => s.clearSelection);

  if (!node) return null;

  const isBlocked = disasters.some((d) => d.node === nodeId) || node.status === NODE_STATUS.BLOCKED;
  const unitsHere = units.filter((u) => u.node === nodeId || u.route?.path.includes(nodeId));
  const congestionPct = Math.round((node.congestion || 0) * 100);

  const afterAction = () => clearSelection();

  return (
    <div className="min-w-[236px]">
      <div className="flex items-start justify-between gap-2 border-b pb-1.5 mb-2">
        <div className="min-w-0 pr-1">
          <span className="text-xs font-bold text-gray-900 leading-tight block truncate">{node.name}</span>
          <span className="text-[10px] font-mono text-gray-400">{node.id}</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            useUIStore.getState().setSelectedNodeId(null);
          }}
          className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-0.5 rounded transition-colors shrink-0"
          title="Close popup"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mb-2">
        {isBlocked ? (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
            Blocked — disaster
          </span>
        ) : light ? (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
            {LIGHT_STATE_LABEL[light.state]}
            {light.servingUnitId ? ` · ${light.servingUnitId}` : ''}
          </span>
        ) : (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
            Clear intersection
          </span>
        )}
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>Live congestion index c_v</span>
          <span className="font-bold text-gray-800">{congestionPct}%</span>
        </div>
        <Meter
          value={node.congestion}
          tone={congestionPct > 60 ? 'bg-orange-500' : congestionPct > 35 ? 'bg-amber-400' : 'bg-green-500'}
        />
        <p className="text-[9px] text-gray-400 mt-1">
          {node.rawDensity?.toFixed(1) ?? 0} civilian agents nearby · EMA smoothed
        </p>
      </div>

      <KeyValue label="Roads meeting here" value={node.degree ?? '—'} />
      <KeyValue label="Coordinates" value={`${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}`} mono />
      {facility && <KeyValue label="Facility" value={facility.name} />}
      <KeyValue label="Units on / through" value={unitsHere.length || '—'} />
      {unitsHere.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 mb-1">
          {unitsHere.map((u) => (
            <span key={u.id} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium">
              {u.id}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5 border-t pt-2">
        {isBlocked ? (
          <Button
            variant="success"
            className="w-full"
            onClick={() => {
              clearDisasterAtNode(node.id);
              afterAction();
            }}
          >
            Clear disaster from this junction
          </Button>
        ) : (
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              openDisasterDialog(node.id);
              afterAction();
            }}
          >
            Inject disaster at this junction…
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            openMissionDialog(node.id);
            afterAction();
          }}
        >
          Create emergency call here…
        </Button>
      </div>
    </div>
  );
}

function NodesLayer() {
  const nodes = useWorldStore((s) => s.nodes);
  const disasters = useWorldStore((s) => s.disasters);
  const lights = useWorldStore((s) => s.lights);
  const facilities = useWorldStore((s) => s.facilities);

  const showCongestion = useSettingsStore((s) => s.showCongestionOverlay);
  const alwaysShowJunctions = useSettingsStore((s) => s.showAllJunctions);

  const selectedNodeId = useUIStore((s) => s.selectedNodeId);

  const [zoom, setZoom] = useState(null);
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const currentZoom = zoom ?? map.getZoom();

  const blocked = useMemo(() => new Set(disasters.map((d) => d.node)), [disasters]);
  const facilityNodes = useMemo(() => new Set(facilities.map((f) => f.node)), [facilities]);

  const showAll = alwaysShowJunctions || currentZoom >= 15;

  const popupCoords = useMemo(() => {
    if (!selectedNodeId) return null;
    const n = nodes.find((node) => node.id === selectedNodeId);
    return n ? [n.lat, n.lng] : null;
  }, [selectedNodeId, nodes]);

  const handleNodeClick = useCallback((e, nodeId) => {
    L.DomEvent.stopPropagation(e);
    // Exclusive selection — clear unit/mission so their popups/routes don't fight this one.
    useUIStore.setState({
      selectedUnitId: null,
      selectedMissionId: null,
      selectedNodeId: nodeId,
      _suppressMapClear: true,
    });
  }, []);

  return (
    <>
      {nodes.map((node) => {
        const isBlocked = blocked.has(node.id) || node.status === NODE_STATUS.BLOCKED;
        const light = lights[node.id];
        const notable =
          isBlocked ||
          Boolean(light) ||
          node.status === NODE_STATUS.CONGESTED ||
          facilityNodes.has(node.id);

        const isSelected = node.id === selectedNodeId;
        if (!notable && !showAll && !isSelected) return null;

        // Facility junctions already have their own marker + popup — skip the plain circle
        // so two popups don't open on top of each other.
        if (facilityNodes.has(node.id) && !isBlocked && !light && node.status !== NODE_STATUS.CONGESTED && !isSelected) {
          return null;
        }

        const look = nodeAppearance(node, light, isBlocked);

        return (
          <React.Fragment key={node.id}>
            {showCongestion && node.congestion > 0.3 && !isBlocked && (
              <CircleMarker
                center={[node.lat, node.lng]}
                radius={8 + node.congestion * 18}
                pathOptions={{
                  color: 'transparent',
                  fillColor: node.congestion > 0.6 ? '#F97316' : '#FBBF24',
                  fillOpacity: 0.08 + node.congestion * 0.18,
                  interactive: false,
                }}
              />
            )}

            {light && light.state === LIGHT_STATE.PREEMPT_GREEN && (
              <CircleMarker
                center={[node.lat, node.lng]}
                radius={15}
                pathOptions={{
                  color: '#22C55E',
                  fillColor: '#22C55E',
                  fillOpacity: 0.2,
                  weight: 2,
                  dashArray: '3, 3',
                  interactive: false,
                }}
              />
            )}

            <CircleMarker
              center={[node.lat, node.lng]}
              radius={look.radius}
              pathOptions={{ color: look.stroke, fillColor: look.fill, fillOpacity: look.opacity, weight: 1.5 }}
              eventHandlers={{ click: (e) => handleNodeClick(e, node.id) }}
            >
              {notable && (
                <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                  <div className="text-[11px] font-semibold">
                    {node.name}
                    <span className="block text-[9px] text-gray-400 font-mono">
                      {isBlocked
                        ? 'Blocked — click to clear'
                        : `c = ${node.congestion?.toFixed(2) ?? '0.00'} · click to act`}
                    </span>
                  </div>
                </Tooltip>
              )}
            </CircleMarker>
          </React.Fragment>
        );
      })}

      {selectedNodeId && popupCoords && (
        <Popup
          key={`node-popup-${selectedNodeId}`}
          position={popupCoords}
          maxWidth={280}
          minWidth={240}
          autoPan={false}
          closeOnClick={false}
          closeButton={false}
        >
          <NodePopupContent nodeId={selectedNodeId} />
        </Popup>
      )}
    </>
  );
}

export default React.memo(NodesLayer);
