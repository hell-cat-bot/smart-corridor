import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VehicleMarker from './VehicleMarker';
import DisasterMarker from './DisasterMarker';
import RoutePolyline from './RoutePolyline';
import MapOverlay from './MapOverlay';
import useGridStore from '../../store/useGridStore';
import useVehicleStore from '../../store/useVehicleStore';
import useDisasterStore from '../../store/useDisasterStore';
import useUIStore from '../../store/useUIStore';
import useActivityLogStore from '../../store/useActivityLogStore';
import { Eye, AlertTriangle, CheckCircle, MapPin } from 'lucide-react';
import { toast } from 'sonner';

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper component to center map ONLY when user clicks a new vehicle
const FlyToVehicle = () => {
  const map = useMap();
  const selectedVehicleId = useUIStore((s) => s.selectedVehicleId);
  const prevSelectedIdRef = useRef(null);

  useEffect(() => {
    if (selectedVehicleId && selectedVehicleId !== prevSelectedIdRef.current) {
      prevSelectedIdRef.current = selectedVehicleId;
      const vehicles = useVehicleStore.getState().vehicles;
      const nodes = useGridStore.getState().nodes;
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      if (vehicle) {
        const node = nodes.find(n => n.id === vehicle.currentNode);
        if (node) {
          map.panTo([node.lat, node.lng], { animate: true, duration: 0.8 });
        }
      }
    }
  }, [selectedVehicleId, map]);

  return null;
};

// Map click handler to clear vehicle selection when clicking empty map area
const MapClickHandler = () => {
  const setSelectedVehicleId = useUIStore((s) => s.setSelectedVehicleId);
  useMapEvents({
    click: (e) => {
      if (e.originalEvent.target.classList.contains('leaflet-container')) {
        setSelectedVehicleId(null);
      }
    },
  });
  return null;
};

const MapView = () => {
  const nodes = useGridStore((s) => s.nodes);
  const center = useGridStore((s) => s.center);
  const zoom = useGridStore((s) => s.zoom);
  const vehicles = useVehicleStore((s) => s.vehicles);
  const routes = useVehicleStore((s) => s.routes);
  const disasters = useDisasterStore((s) => s.disasters);
  const selectedVehicleId = useUIStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useUIStore((s) => s.setSelectedVehicleId);

  const addDisaster = useDisasterStore((s) => s.addDisaster);
  const removeDisaster = useDisasterStore((s) => s.removeDisaster);
  const blockNode = useGridStore((s) => s.blockNode);
  const clearNode = useGridStore((s) => s.clearNode);
  const addEntry = useActivityLogStore((s) => s.addEntry);

  if (!nodes || nodes.length === 0) {
    return <div className="h-full w-full bg-gray-100 animate-pulse rounded-xl" />;
  }

  const hasSelection = Boolean(selectedVehicleId);

  // Compute set of all nodes currently preempted by active emergency Green Wave corridors
  const greenWaveNodes = new Set();
  vehicles.forEach((v) => {
    if ((v.type === 'ambulance' || v.type === 'firetruck') && (v.status === 'en_route' || v.status === 'rerouted')) {
      const path = routes[v.id]?.path || [];
      path.forEach(nodeId => greenWaveNodes.add(nodeId));
    }
  });

  const handleInjectDisasterOnNode = (node) => {
    const types = ['flood', 'landslide', 'earthquake', 'tsunami'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    const disaster = {
      id: `DIS-${Date.now().toString(36).toUpperCase()}`,
      type: randomType,
      node: node.id,
      severity: 0.8,
      label: `${randomType.toUpperCase()} Alert - ${node.name || node.id}`,
      timestamp: new Date().toISOString()
    };

    addDisaster(disaster);
    blockNode(node.id);
    addEntry('disaster_detected', `Disaster injected at ${node.name || node.id}`, disaster, 'critical');
    toast.error(`🚨 Disaster placed at ${node.name || node.id}`);
  };

  const handleClearDisasterOnNode = (nodeId) => {
    const activeD = disasters.find(d => d.node === nodeId);
    if (activeD) {
      removeDisaster(activeD.id);
    }
    clearNode(nodeId);
    addEntry('disaster_cleared', `Disaster cleared at node ${nodeId}`, { nodeId }, 'info');
    toast.success(`Disaster cleared at ${nodeId}`);
  };

  return (
    <div className="relative h-full w-full rounded-xl overflow-hidden">
      <MapOverlay />

      {/* Show All Paths Floating Button when a vehicle is selected */}
      {hasSelection && (
        <button
          onClick={() => setSelectedVehicleId(null)}
          className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-md border border-[#E5E7EB] shadow-md px-3.5 py-2 rounded-xl text-xs font-bold text-gray-800 hover:bg-gray-50 flex items-center gap-2 transition-all"
        >
          <Eye className="w-4 h-4 text-[#7C6FEF]" />
          <span>Show All Vehicle Paths</span>
        </button>
      )}

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom || 15}
        className="h-full w-full rounded-xl z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FlyToVehicle />
        <MapClickHandler />

        {/* Grid Intersections with High-Visibility Clickable Popups */}
        {nodes.map(node => {
          let fillColor = '#64748B';
          let radius = 7;
          let fillOpacity = 0.7;
          
          const isBlocked = node.status === 'blocked' || disasters.some(d => d.node === node.id);
          const isGreenWave = !isBlocked && greenWaveNodes.has(node.id);
          const congestionPct = Math.round((node.congestion || 0) * 100);

          if (isBlocked) {
            fillColor = '#DC2626';
            radius = 10;
            fillOpacity = 0.95;
          } else if (isGreenWave) {
            fillColor = '#22C55E';
            radius = 9;
            fillOpacity = 0.95;
          } else if (node.status === 'congested' || (node.congestion && node.congestion > 0.6)) {
            fillColor = '#EA580C';
            radius = 8;
          }

          // Vehicles currently at or passing through this node
          const passingVehicles = vehicles.filter(v => {
            const path = routes[v.id]?.path || [];
            return v.currentNode === node.id || path.includes(node.id);
          });

          return (
            <React.Fragment key={node.id}>
              {/* Outer Pulse Ring for Preempted Green Wave Intersections (interactive: false so clicks pass through) */}
              {isGreenWave && (
                <CircleMarker
                  center={[node.lat, node.lng]}
                  radius={15}
                  pathOptions={{
                    color: '#22C55E',
                    fillColor: '#22C55E',
                    fillOpacity: 0.25,
                    weight: 2,
                    dashArray: '3, 3',
                    interactive: false
                  }}
                />
              )}

              <CircleMarker
                center={[node.lat, node.lng]}
                radius={radius}
                pathOptions={{
                  color: isBlocked ? '#991B1B' : isGreenWave ? '#15803D' : '#334155',
                  fillColor,
                  fillOpacity,
                  weight: 2,
                  interactive: true
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                  }
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                  <div className="font-semibold text-xs">
                    <span>{node.name || node.id}</span>
                    <span className="text-[10px] text-gray-400 font-mono block">Click to inspect / place disaster</span>
                  </div>
                </Tooltip>

                {/* Rich Detail Card Popup on Click */}
                <Popup>
                  <div className="min-w-[210px] p-1 font-sans">
                    <div className="font-bold text-gray-900 border-b pb-2 mb-2 text-sm flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-[#7C6FEF]" />
                        {node.name || node.id}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400 font-normal">{node.id}</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      {/* Node Status */}
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">5G V2X Status</span>
                        {isBlocked ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                            🔴 Blocked (Disaster)
                          </span>
                        ) : isGreenWave ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                            🟢 Green Wave Preempted
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                            Clear Intersection
                          </span>
                        )}
                      </div>

                      {/* Congestion Progress */}
                      <div>
                        <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                          <span>Traffic Density</span>
                          <span className="font-semibold text-gray-800">{congestionPct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${congestionPct > 60 ? 'bg-amber-500' : 'bg-green-500'}`}
                            style={{ width: `${congestionPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Coordinates */}
                      <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono">
                        <span>Coordinates</span>
                        <span>{node.lat.toFixed(4)}, {node.lng.toFixed(4)}</span>
                      </div>

                      {/* Active Corridors */}
                      <div className="border-t pt-2">
                        <span className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Corridor Fleet ({passingVehicles.length})</span>
                        {passingVehicles.length === 0 ? (
                          <span className="text-[10px] text-gray-400 italic">No vehicles currently on this node</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {passingVehicles.map(v => (
                              <span key={v.id} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium">
                                {v.label || v.id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Quick Action Button: Inject or Clear Disaster */}
                      <div className="pt-1">
                        {isBlocked ? (
                          <button
                            onClick={() => handleClearDisasterOnNode(node.id)}
                            className="w-full mt-2 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Clear Disaster from this Node
                          </button>
                        ) : (
                          <button
                            onClick={() => handleInjectDisasterOnNode(node)}
                            className="w-full mt-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Inject Disaster at this Node
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </React.Fragment>
          );
        })}

        {/* Disasters */}
        {disasters.map(disaster => (
          <DisasterMarker key={disaster.id} disaster={disaster} />
        ))}

        {/* Routes */}
        {vehicles.map(vehicle => {
          const route = routes[vehicle.id];
          if (!route) return null;

          const isSelected = selectedVehicleId === vehicle.id;
          const isDimmed = hasSelection && !isSelected;

          return (
            <React.Fragment key={`route-${vehicle.id}`}>
              {route.path && route.path.length > 0 && (
                <RoutePolyline
                  vehicleId={vehicle.id}
                  path={route.path}
                  isOriginal={false}
                  vehicleType={vehicle.type}
                  isSelected={isSelected}
                  isDimmed={isDimmed}
                />
              )}
              {route.originalPath && route.originalPath.length > 0 && (
                <RoutePolyline
                  vehicleId={vehicle.id}
                  path={route.originalPath}
                  isOriginal={true}
                  vehicleType={vehicle.type}
                  isSelected={isSelected}
                  isDimmed={isDimmed}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Vehicles */}
        {vehicles.map(vehicle => (
          <VehicleMarker key={vehicle.id} vehicle={vehicle} />
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;
