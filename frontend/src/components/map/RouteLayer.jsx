import React, { useMemo } from 'react';
import { Polyline, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import useWorldStore from '../../store/useWorldStore';
import { LEG_TYPE, VEHICLE_COLOR } from '../../domain/constants';
import { measurePath, indexNodes } from '../../utils/geo';

/** Expand a node path to the real road polyline it runs along. */
function coordsFor(path, nodes, edgeIndex) {
  if (!path || path.length === 0) return [];
  return measurePath(path, { nodeMap: indexNodes(nodes), edgeIndex }).coords;
}

function destIcon(color, label, showLabel) {
  return L.divIcon({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;">&#127937;</div>
        ${
          showLabel
            ? `<div style="margin-top:3px;white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-size:8.5px;font-weight:800;padding:1px 6px;border-radius:9999px;background:rgba(15,23,42,0.9);color:white;">${label}</div>`
            : ''
        }
      </div>`,
    className: 'bg-transparent border-0 overflow-visible',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/**
 * Active leg drawn solid; the path the unit was on before a blockage-driven
 * replan stays as a dashed red comparison line.
 */
export default function RouteLayer({ unit, selected, dimmed }) {
  const nodes = useWorldStore((s) => s.nodes);
  const edgeIndex = useWorldStore((s) => s.edgeIndex);
  const route = unit.route;

  const originalCoords = useMemo(
    () => (route?.originalPath ? coordsFor(route.originalPath, nodes, edgeIndex) : []),
    [route?.originalPath, nodes, edgeIndex],
  );

  if (!route || route.coords.length < 2) return null;

  const isReturn = route.legType === 'return';
  let color = VEHICLE_COLOR[unit.type] ?? '#2563EB';
  if (route.legType === LEG_TYPE.TO_HOSPITAL) color = '#16A34A';
  if (isReturn) color = '#94A3B8';

  const weight = selected ? 6 : dimmed ? 2.5 : 4;
  const opacity = selected ? 1 : dimmed ? 0.28 : 0.8;

  const last = route.coords[route.coords.length - 1];

  return (
    <>
      {originalCoords.length > 1 && !dimmed && (
        <Polyline
          positions={originalCoords}
          pathOptions={{ color: '#EF4444', weight: 3, opacity: 0.55, dashArray: '6, 8' }}
        >
          <Tooltip sticky>
            <span className="text-[11px] font-semibold text-red-600">
              Original path before replan · {unit.label}
            </span>
          </Tooltip>
        </Polyline>
      )}

      <Polyline
        positions={route.coords}
        pathOptions={{
          color,
          weight,
          opacity,
          dashArray: isReturn ? '2, 6' : undefined,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      >
        <Tooltip sticky>
          <span className="text-[11px] font-semibold" style={{ color }}>
            {unit.label} · {isReturn ? 'return run' : route.legType === LEG_TYPE.TO_SCENE ? 'Leg 1 to scene' : 'Leg 2 to hospital'}
          </span>
        </Tooltip>
      </Polyline>

      {!dimmed && !isReturn && (
        <Marker
          position={last}
          icon={destIcon(color, route.legType === LEG_TYPE.TO_SCENE ? 'SCENE' : 'HOSPITAL', selected)}
          zIndexOffset={400}
        />
      )}
    </>
  );
}

export { coordsFor };
