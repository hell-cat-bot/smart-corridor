import React, { useMemo } from 'react';
import { Polyline, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import useGridStore from '../../store/useGridStore';

const RoutePolyline = ({ vehicleId, path, isOriginal, vehicleType, isSelected, isDimmed }) => {
  const nodes = useGridStore((s) => s.nodes);

  if (!nodes || !path || path.length < 2) return null;

  const positions = path.map(nodeId => {
    const node = nodes.find(n => n.id === nodeId);
    return node ? [node.lat, node.lng] : null;
  }).filter(Boolean);

  if (positions.length < 2) return null;

  let color = '#2563EB';
  if (vehicleType === 'ambulance') color = '#DC2626';
  else if (vehicleType === 'firetruck') color = '#EA580C';
  
  if (isOriginal) {
    color = '#EF4444'; // Dashed red for blocked pre-reroute path
  }

  // Adjust weight and opacity based on selection state
  let weight = 4;
  let opacity = 0.75;

  if (isSelected) {
    weight = isOriginal ? 4 : 6;
    opacity = 1.0;
  } else if (isDimmed) {
    weight = 2.5;
    opacity = 0.3;
  }

  const destPos = positions[positions.length - 1];
  const destNodeId = path[path.length - 1];
  const destNodeObj = nodes.find(n => n.id === destNodeId);

  // Custom clean destination pin icon (centered accurately)
  const destIcon = useMemo(() => {
    if (!destNodeId) return null;

    const bgColor = vehicleType === 'ambulance' ? '#DC2626' : vehicleType === 'firetruck' ? '#EA580C' : '#2563EB';
    const destName = destNodeObj?.name || destNodeId;

    const html = `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${bgColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid white; shrink-0;">
          🏁
        </div>
        ${isSelected ? `
          <div style="margin-top: 3px; white-space: nowrap; font-family: Inter, system-ui, sans-serif; font-size: 9px; font-weight: 800; padding: 1.5px 6px; border-radius: 9999px; background: rgba(15, 23, 42, 0.92); color: white; border: 1px solid rgba(255, 255, 255, 0.8); box-shadow: 0 2px 6px rgba(0,0,0,0.25);">
            DEST: ${destName}
          </div>
        ` : ''}
      </div>
    `;

    return L.divIcon({
      html,
      className: 'bg-transparent border-0 overflow-visible',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }, [destNodeId, destNodeObj, vehicleType, isSelected]);

  return (
    <>
      <Polyline 
        positions={positions}
        pathOptions={{
          color,
          weight,
          dashArray: isOriginal ? '6, 8' : undefined,
          opacity,
          lineCap: 'round',
          lineJoin: 'round'
        }}
      >
        {isOriginal && isSelected && (
          <Tooltip direction="top" opacity={0.9}>
            <span className="font-semibold text-xs text-red-600">Original Path (Pre-Reroute Blocked)</span>
          </Tooltip>
        )}
      </Polyline>

      {/* Destination Pin Marker */}
      {!isOriginal && destPos && destIcon && (isSelected || !isDimmed) && (
        <Marker position={destPos} icon={destIcon}>
          <Popup>
            <div className="p-1 min-w-[160px] text-xs font-sans">
              <div className="font-bold text-gray-900 border-b pb-1.5 mb-1.5 flex items-center justify-between">
                <span>🏁 Destination Point</span>
                <span className="text-[10px] font-mono text-gray-400 font-normal">{destNodeId}</span>
              </div>
              <div className="space-y-1 text-gray-600">
                <div>
                  <span className="text-gray-400 block text-[10px]">Location</span>
                  <span className="font-semibold text-gray-800">{destNodeObj?.name || destNodeId}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Vehicle Target</span>
                  <span className="font-semibold text-[#7C6FEF]">{vehicleId}</span>
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
};

export default RoutePolyline;
