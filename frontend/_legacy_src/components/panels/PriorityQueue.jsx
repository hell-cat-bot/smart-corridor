import React from 'react';
import useVehicleStore from '../../store/useVehicleStore';
import useActivityLogStore from '../../store/useActivityLogStore';
import { Siren, Flame, Car, Lock, Play } from 'lucide-react';
import { toast } from 'sonner';

export default function PriorityQueue() {
  const vehicles = useVehicleStore((s) => s.vehicles);
  const updateVehicleStatus = useVehicleStore((s) => s.updateVehicleStatus);
  const addEntry = useActivityLogStore((s) => s.addEntry);

  const pendingVehicles = [...(vehicles || [])]
    .filter(v => v.status === 'waiting')
    .sort((a, b) => parseInt(a.priority) - parseInt(b.priority));

  const getPriorityBadge = (priority) => {
    switch (String(priority)) {
      case '1': return 'bg-red-100 text-red-700 border border-red-200';
      case '2': return 'bg-amber-100 text-amber-700 border border-amber-200';
      default: return 'bg-blue-100 text-blue-700 border border-blue-200';
    }
  };

  const getIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'ambulance': return Siren;
      case 'firetruck': return Flame;
      default: return Car;
    }
  };

  const handleDispatch = (v) => {
    updateVehicleStatus(v.id, 'en_route');
    addEntry('vehicle_dispatched', `Emergency dispatch approved for ${v.label} (${v.id})`, v, 'success');
    toast.success(`Dispatched vehicle ${v.id}`);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Grievance & Dispatch Priority Queue</h3>
          <p className="text-xs text-gray-500">Manual approval required for queue clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          {pendingVehicles.length} Requests Pending
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        {pendingVehicles.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400 italic">
            No pending dispatch requests. Queue clear.
          </div>
        ) : (
          pendingVehicles.map(vehicle => {
            const Icon = getIcon(vehicle.type);
            return (
              <div 
                key={vehicle.id} 
                className="flex items-center justify-between p-3 border border-gray-100 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getPriorityBadge(vehicle.priority)}`}>
                    Priority {vehicle.priority}
                  </span>
                  <div className="p-1.5 bg-white rounded border border-gray-200">
                    <Icon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-900">{vehicle.label}</h4>
                    <p className="text-[10px] text-gray-500">ID: {vehicle.id} · Payload: {vehicle.health || 100}% · Node: {vehicle.currentNode}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block">Est. Routing Delay</span>
                    <span className="text-xs font-semibold text-gray-700">0.0ms (5G Link)</span>
                  </div>
                  <button 
                    onClick={() => handleDispatch(vehicle)}
                    className="flex items-center gap-1 bg-[#7C6FEF] hover:bg-[#6C5FDF] text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    Approve & Dispatch
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-gray-400">
        <div className="flex items-center gap-1.5 text-[11px]">
          <Lock className="w-3.5 h-3.5" />
          <span>future: auto-escalate if queue length exceeds threshold</span>
        </div>
        <span className="text-[10px] uppercase font-bold text-gray-300">V2X System Enabled</span>
      </div>
    </div>
  );
}
