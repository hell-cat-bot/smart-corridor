import React, { useState, useEffect, useRef } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import useGridStore from '../../store/useGridStore';
import useUIStore from '../../store/useUIStore';
import useSettingsStore from '../../store/useSettingsStore';

const ambulanceSvg = `<svg width="40" height="24" viewBox="0 0 40 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="36" height="20" rx="5" fill="white" stroke="#DC2626" stroke-width="1.5"/>
  <rect x="2" y="10" width="36" height="4" fill="#DC2626"/>
  <rect x="28" y="4" width="6" height="16" rx="1.5" fill="#1F2937" opacity="0.85"/>
  <rect x="15" y="6" width="2" height="12" fill="#DC2626"/>
  <rect x="10" y="11" width="12" height="2" fill="#DC2626"/>
  <rect x="30" y="2" width="4" height="3" rx="1" fill="#EF4444"/>
  <circle cx="8" cy="1" r="2.5" fill="#111827"/>
  <circle cx="8" cy="23" r="2.5" fill="#111827"/>
  <circle cx="32" cy="1" r="2.5" fill="#111827"/>
  <circle cx="32" cy="23" r="2.5" fill="#111827"/>
</svg>`;

const firetruckSvg = `<svg width="44" height="24" viewBox="0 0 44 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="40" height="20" rx="5" fill="#DC2626" stroke="#991B1B" stroke-width="1.5"/>
  <rect x="2" y="11" width="40" height="2" fill="#FCD34D"/>
  <rect x="32" y="4" width="8" height="16" rx="1.5" fill="#1F2937" opacity="0.85"/>
  <rect x="8" y="7" width="20" height="10" fill="none" stroke="#FCA5A5" stroke-width="1"/>
  <line x1="12" y1="7" x2="12" y2="17" stroke="#FCA5A5" stroke-width="1"/>
  <line x1="16" y1="7" x2="16" y2="17" stroke="#FCA5A5" stroke-width="1"/>
  <line x1="20" y1="7" x2="20" y2="17" stroke="#FCA5A5" stroke-width="1"/>
  <line x1="24" y1="7" x2="24" y2="17" stroke="#FCA5A5" stroke-width="1"/>
  <rect x="34" y="2" width="3" height="3" rx="1" fill="#EF4444"/>
  <circle cx="8" cy="1" r="2.5" fill="#111827"/>
  <circle cx="8" cy="23" r="2.5" fill="#111827"/>
  <circle cx="34" cy="1" r="2.5" fill="#111827"/>
  <circle cx="34" cy="23" r="2.5" fill="#111827"/>
</svg>`;

const regularCarSvg = `<svg width="36" height="22" viewBox="0 0 36 22" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="32" height="18" rx="5" fill="#475569" stroke="#334155" stroke-width="1.5"/>
  <rect x="10" y="4" width="18" height="14" rx="3" fill="#1E293B"/>
  <rect x="14" y="6" width="10" height="10" rx="1" fill="#475569"/>
  <circle cx="8" cy="1" r="2" fill="#111827"/>
  <circle cx="8" cy="21" r="2" fill="#111827"/>
  <circle cx="28" cy="1" r="2" fill="#111827"/>
  <circle cx="28" cy="21" r="2" fill="#111827"/>
</svg>`;

const getSvg = (type) => {
  switch (type) {
    case 'ambulance': return ambulanceSvg;
    case 'firetruck': return firetruckSvg;
    default: return regularCarSvg;
  }
};

const statusDotColors = {
  ambulance: '#DC2626',
  firetruck: '#EA580C',
  regular: '#3B82F6',
};

const VehicleMarker = ({ vehicle }) => {
  const nodes = useGridStore((s) => s.nodes);
  const setSelectedVehicleId = useUIStore((s) => s.setSelectedVehicleId);
  const playbackSpeed = useUIStore((s) => s.playbackSpeed);
  const showMapLabels = useSettingsStore((s) => s.showMapLabels);
  const animateVehicles = useSettingsStore((s) => s.animateVehicles);

  const node = nodes.find(n => n.id === vehicle.currentNode);
  
  const [currentPos, setCurrentPos] = useState(null);
  const [heading, setHeading] = useState(vehicle.heading || 0);
  
  const prevNodeIdRef = useRef(null);
  const animationRef = useRef(null);

  // Sync position on node change or init
  useEffect(() => {
    if (node) {
      if (!currentPos) {
        setCurrentPos([node.lat, node.lng]);
        prevNodeIdRef.current = vehicle.currentNode;
      }
    }
  }, [node, currentPos, vehicle.currentNode]);

  // Smooth interpolation along road segment
  useEffect(() => {
    if (!node || !currentPos) return;

    if (vehicle.currentNode !== prevNodeIdRef.current) {
      const prevNode = nodes.find(n => n.id === prevNodeIdRef.current);
      const startLatLng = prevNode ? [prevNode.lat, prevNode.lng] : currentPos;
      const targetLatLng = [node.lat, node.lng];
      
      prevNodeIdRef.current = vehicle.currentNode;

      // Heading calculation
      const dLat = targetLatLng[0] - startLatLng[0];
      const dLng = targetLatLng[1] - startLatLng[1];
      if (Math.abs(dLat) > 0.00001 || Math.abs(dLng) > 0.00001) {
        const newHeading = Math.atan2(dLng, dLat) * (180 / Math.PI);
        setHeading(newHeading);
      }

      if (!animateVehicles) {
        setCurrentPos(targetLatLng);
        return;
      }

      // Smooth easing over frame steps
      const duration = 1500 / playbackSpeed;
      const startTime = performance.now();

      if (animationRef.current) cancelAnimationFrame(animationRef.current);

      const animate = (time) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const ease = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const currentLat = startLatLng[0] + (targetLatLng[0] - startLatLng[0]) * ease;
        const currentLng = startLatLng[1] + (targetLatLng[1] - startLatLng[1]) * ease;
        
        setCurrentPos([currentLat, currentLng]);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [vehicle.currentNode, node, nodes, playbackSpeed, animateVehicles]);

  if (!node || !currentPos) return null;

  const svgHtml = getSvg(vehicle.type);
  const typeDotColor = statusDotColors[vehicle.type] || '#64748B';

  const customIcon = L.divIcon({
    html: `
      <div style="position: relative; width: 40px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <div style="transform: rotate(${heading}deg); transform-origin: center center; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.3));">
          ${svgHtml}
        </div>
        ${showMapLabels ? `
          <div style="position: absolute; top: 26px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: Inter, system-ui, sans-serif; font-size: 9px; font-weight: 800; padding: 1.5px 7px; border-radius: 9999px; background: rgba(255,255,255,0.96); color: #0F172A; border: 1px solid rgba(203,213,225,0.9); box-shadow: 0 2px 6px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 4px; pointer-events: none;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: ${typeDotColor}; flex-shrink: 0;"></span>
            <span>${vehicle.label || vehicle.id}</span>
          </div>
        ` : ''}
      </div>
    `,
    className: 'bg-transparent border-0 overflow-visible',
    iconSize: [40, 24],
    iconAnchor: [20, 12],
    popupAnchor: [0, -12]
  });

  const statusColors = {
    en_route: 'bg-[#DBEAFE] text-[#2563EB] border border-blue-200',
    rerouted: 'bg-[#FEF3C7] text-[#D97706] border border-amber-200',
    arrived: 'bg-[#DCFCE7] text-[#16A34A] border border-green-200',
    waiting: 'bg-gray-100 text-gray-500 border border-gray-200',
  };

  const statusLabel = {
    en_route: 'En Route',
    rerouted: 'Rerouted',
    arrived: 'Arrived',
    waiting: 'Waiting',
  };

  return (
    <Marker 
      position={currentPos} 
      icon={customIcon}
      eventHandlers={{
        click: (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedVehicleId(vehicle.id);
        },
      }}
    >
      <Popup>
        <div className="min-w-[180px] p-0.5">
          <div className="font-semibold text-gray-900 border-b pb-1.5 mb-2 text-xs flex justify-between items-center">
            <span>{vehicle.label || vehicle.id}</span>
            <span className="text-[10px] font-mono text-gray-400 font-normal">{vehicle.id}</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Type</span>
              <span className="font-medium capitalize text-gray-700">{vehicle.type}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Status</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[vehicle.status] || ''}`}>
                {statusLabel[vehicle.status] || vehicle.status}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Priority Level</span>
              <span className="font-semibold text-gray-800">{vehicle.priority === 1 ? '🔴 Critical' : vehicle.priority === 2 ? '🟠 High' : '🔵 Normal'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">ETA</span>
              <span className="font-bold text-[#16A34A]">{Math.round(vehicle.eta / 60)} min</span>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

export default VehicleMarker;
