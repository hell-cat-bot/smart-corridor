import React, { useState } from 'react';
import { Search, Siren, Flame, Car, ChevronLeft, ChevronRight, Filter, Play } from 'lucide-react';
import useVehicleStore from '../../store/useVehicleStore';
import useUIStore from '../../store/useUIStore';
import useActivityLogStore from '../../store/useActivityLogStore';
import { toast } from 'sonner';

const typeIcons = {
  ambulance: { icon: Siren, color: 'bg-red-500' },
  firetruck: { icon: Flame, color: 'bg-orange-500' },
  regular: { icon: Car, color: 'bg-slate-500' },
};

const statusBadges = {
  en_route: { label: 'En Route', cls: 'bg-[#DBEAFE] text-[#2563EB]' },
  rerouted: { label: 'Rerouted', cls: 'bg-[#FEF3C7] text-[#D97706]' },
  arrived: { label: 'Arrived', cls: 'bg-[#DCFCE7] text-[#16A34A]' },
  waiting: { label: 'Waiting', cls: 'bg-gray-100 text-gray-600' },
};

export default function VehicleListPanel() {
  const vehicles = useVehicleStore((s) => s.vehicles);
  const updateVehicleStatus = useVehicleStore((s) => s.updateVehicleStatus);
  const selectedVehicleId = useUIStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useUIStore((s) => s.setSelectedVehicleId);
  const addEntry = useActivityLogStore((s) => s.addEntry);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isMinimized, setIsMinimized] = useState(false);

  const filtered = vehicles.filter(v => {
    const matchSearch = !searchTerm || 
      (v.label || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      v.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = filterType === 'all' || v.type === filterType;
    return matchSearch && matchType;
  });

  const handleSelectVehicle = (vehicleId) => {
    if (selectedVehicleId === vehicleId) {
      setSelectedVehicleId(null); // Toggle off selection to show all paths!
    } else {
      setSelectedVehicleId(vehicleId);
    }
  };

  const handleDispatch = (e, vehicle) => {
    e.stopPropagation();
    updateVehicleStatus(vehicle.id, 'en_route');
    addEntry('vehicle_dispatched', `Emergency dispatch approved for ${vehicle.label} (${vehicle.id})`, vehicle, 'success');
    toast.success(`Dispatched ${vehicle.label}`);
  };

  if (isMinimized) {
    return (
      <div className="w-14 flex flex-col items-center bg-white rounded-xl border border-[#E5E7EB] overflow-hidden shrink-0 transition-all duration-300 py-3 gap-3 shadow-sm">
        <button
          onClick={() => setIsMinimized(false)}
          className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-[#7C6FEF] hover:text-white text-gray-600 flex items-center justify-center transition-colors"
          title="Expand Search & Vehicle List"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="w-8 h-[1px] bg-gray-200" />

        <div className="flex-1 overflow-y-auto w-full px-2 space-y-2.5 flex flex-col items-center">
          {vehicles.map(vehicle => {
            const typeInfo = typeIcons[vehicle.type] || typeIcons.regular;
            const TypeIcon = typeInfo.icon;
            const isSelected = selectedVehicleId === vehicle.id;

            return (
              <button
                key={vehicle.id}
                onClick={() => handleSelectVehicle(vehicle.id)}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${typeInfo.color} ${
                  isSelected ? 'ring-4 ring-[#7C6FEF]/40 scale-110' : 'hover:scale-105 opacity-90'
                }`}
                title={`${vehicle.label} (${vehicle.id}) - ${vehicle.status} (Click to toggle selection)`}
              >
                <TypeIcon className="w-4 h-4 text-white" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 flex flex-col bg-white rounded-xl border border-[#E5E7EB] overflow-hidden shrink-0 transition-all duration-300 shadow-sm">
      {/* Header with Minimize Button */}
      <div className="p-3 border-b border-[#E5E7EB] bg-gray-50/50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#7C6FEF]" />
          <span className="font-semibold text-xs text-gray-900">Vehicle Operations</span>
        </div>
        <button
          onClick={() => setIsMinimized(true)}
          className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-md transition-colors"
          title="Minimize Panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input & Type Filter */}
      <div className="p-3 border-b border-[#E5E7EB]">
        <div className="relative mb-2.5">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input 
            type="text" placeholder="Search vehicles..." 
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#7C6FEF] focus:border-transparent outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[['all', 'All'], ['ambulance', 'Ambulance'], ['firetruck', 'Fire Truck'], ['regular', 'Regular']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filterType === key ? 'bg-[#7C6FEF] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Vehicle Cards List */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 mt-8">No vehicles found</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(vehicle => {
              const typeInfo = typeIcons[vehicle.type] || typeIcons.regular;
              const TypeIcon = typeInfo.icon;
              const badge = statusBadges[vehicle.status] || statusBadges.waiting;
              const isSelected = selectedVehicleId === vehicle.id;

              return (
                <div
                  key={vehicle.id}
                  onClick={() => handleSelectVehicle(vehicle.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#7C6FEF]/10 ring-2 ring-[#7C6FEF]'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${typeInfo.color}`}>
                      <TypeIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-semibold text-gray-900 truncate">{vehicle.label}</h4>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5 text-[10px] text-gray-400">
                        <span>{vehicle.id}</span>
                        <span>ETA: {Math.round(vehicle.eta / 60)}m</span>
                      </div>
                    </div>
                  </div>

                  {vehicle.status === 'waiting' && (
                    <button
                      onClick={(e) => handleDispatch(e, vehicle)}
                      className="px-2 py-1 text-[10px] font-bold text-white bg-[#7C6FEF] hover:bg-[#6C5FDF] rounded flex items-center gap-1 shadow-sm shrink-0"
                      title="Approve & Dispatch"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      Dispatch
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
