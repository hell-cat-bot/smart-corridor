import React from 'react';
import useVehicleStore from '../../store/useVehicleStore';
import useGridStore from '../../store/useGridStore';
import useUIStore from '../../store/useUIStore';
import { ArrowRight, Info, AlertTriangle, CheckCircle2, GitBranch, ShieldCheck } from 'lucide-react';
import { dijkstra } from '../../utils/pathfinding';

export default function RouteComparison() {
  const vehicles = useVehicleStore((s) => s.vehicles);
  const routes = useVehicleStore((s) => s.routes);
  const nodes = useGridStore((s) => s.nodes);
  const edges = useGridStore((s) => s.edges);
  const selectedVehicleId = useUIStore((s) => s.selectedVehicleId);

  const vehicle = vehicles?.find(v => v.id === selectedVehicleId);
  const route = vehicle ? routes[vehicle.id] : null;

  if (!vehicle) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-6">
        <Info className="w-8 h-8 mb-2 text-[#7C6FEF] opacity-70" />
        <p className="text-sm font-semibold text-gray-700">Select a vehicle from the list to view route path comparison</p>
        <p className="text-xs text-gray-400 mt-1">Compares live $A^*$ optimal path vs original pre-disaster or backup Dijkstra paths</p>
      </div>
    );
  }

  const renderPathNodes = (pathNodes, isBlocked = false) => {
    if (!pathNodes || pathNodes.length === 0) {
      return <span className="text-xs text-gray-400 italic">No node sequence calculated</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {pathNodes.map((nodeId, i) => {
          const isMid = isBlocked && i === Math.floor(pathNodes.length / 2);
          return (
            <React.Fragment key={i}>
              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                isMid
                  ? 'bg-red-100 text-red-700 border border-red-300 animate-pulse'
                  : isBlocked
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-[#EDE9FE] text-[#7C6FEF] border border-[#7C6FEF]/20'
              }`}>
                {nodeId}
              </span>
              {i < pathNodes.length - 1 && <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const hasOriginalBlocked = route?.originalPath && route.originalPath.length > 0;
  const currentPath = route?.path || [vehicle.currentNode, vehicle.destinationNode];
  
  // If no original blocked path, compute Dijkstra backup path for side-by-side comparison
  const backupDijkstra = dijkstra(nodes, edges, vehicle.currentNode, vehicle.destinationNode);
  const altPath = hasOriginalBlocked ? route.originalPath : (backupDijkstra.path.length ? backupDijkstra.path : currentPath);

  const currentDist = currentPath.length * 300;
  const altDist = altPath.length * 300;
  const etaMin = Math.round(vehicle.eta / 60);

  return (
    <div className="h-full flex flex-col">
      {/* Panel Header */}
      <div className="mb-3 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#7C6FEF]" />
            <h3 className="font-semibold text-gray-900 text-sm">Path Comparison: {vehicle.label} ({vehicle.id})</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Status: <span className="font-semibold text-gray-700 capitalize">{vehicle.status.replace('_', ' ')}</span> · 
            Priority Level: <span className="font-semibold text-[#7C6FEF]">{vehicle.priority}</span> · 
            Current Location: <span className="font-mono text-gray-700">{vehicle.currentNode}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase bg-[#EDE9FE] text-[#7C6FEF] px-2.5 py-1 rounded-full border border-[#7C6FEF]/20 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            5G-URLLC Preemption Active
          </span>
        </div>
      </div>

      {/* Side-by-Side Comparison Grid */}
      <div className="flex-grow min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Card 1: Live Optimal Path (A* Search) */}
        <div className="p-4 rounded-xl border border-green-200 bg-green-50/20 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Live Optimal Path (A* Algorithm)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                ACTIVE
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 py-2 border-y border-green-200/40 my-2 text-center text-xs">
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Nodes</span>
                <span className="font-bold text-gray-800">{currentPath.length}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Est. Distance</span>
                <span className="font-bold text-gray-800">{currentDist}m</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Est. Time</span>
                <span className="font-bold text-green-600">{etaMin} min</span>
              </div>
            </div>

            <div className="pt-1">
              <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Node Sequence</span>
              {renderPathNodes(currentPath, false)}
            </div>
          </div>
        </div>

        {/* Card 2: Original Blocked Path OR Backup Dijkstra Path */}
        <div className={`p-4 rounded-xl border flex flex-col justify-between shadow-sm ${
          hasOriginalBlocked ? 'border-red-200 bg-red-50/30' : 'border-blue-200 bg-blue-50/20'
        }`}>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                {hasOriginalBlocked ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    Original Pre-Reroute Path
                  </>
                ) : (
                  <>
                    <GitBranch className="w-4 h-4 text-blue-600" />
                    Secondary Backup Route (Dijkstra)
                  </>
                )}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                hasOriginalBlocked ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-blue-100 text-blue-700 border border-blue-200'
              }`}>
                {hasOriginalBlocked ? 'BLOCKED' : 'BACKUP'}
              </span>
            </div>

            <div className={`grid grid-cols-3 gap-2 py-2 border-y my-2 text-center text-xs ${
              hasOriginalBlocked ? 'border-red-200/40' : 'border-blue-200/40'
            }`}>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Nodes</span>
                <span className="font-bold text-gray-800">{altPath.length}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Est. Distance</span>
                <span className="font-bold text-gray-800">{altDist}m</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Status</span>
                <span className={`font-bold ${hasOriginalBlocked ? 'text-red-600' : 'text-blue-600'}`}>
                  {hasOriginalBlocked ? 'Detour Avoided' : 'Secondary'}
                </span>
              </div>
            </div>

            <div className="pt-1">
              <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Node Sequence</span>
              {renderPathNodes(altPath, hasOriginalBlocked)}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
