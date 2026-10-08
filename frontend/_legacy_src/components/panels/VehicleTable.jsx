import React, { useState } from 'react';
import useVehicleStore from '../../store/useVehicleStore';
import { Search, Siren, Flame, Car } from 'lucide-react';

const typeIcons = {
  ambulance: Siren,
  firetruck: Flame,
  regular: Car,
};

export default function VehicleTable() {
  const vehicles = useVehicleStore((s) => s.vehicles);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = (vehicles || []).filter(v => 
    v.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'en_route': return <span className="px-2 py-1 text-xs rounded-full bg-[#DBEAFE] text-[#2563EB] font-medium border border-blue-200">En Route</span>;
      case 'rerouted': return <span className="px-2 py-1 text-xs rounded-full bg-[#FEF3C7] text-[#D97706] font-medium border border-amber-200">Rerouted</span>;
      case 'arrived': return <span className="px-2 py-1 text-xs rounded-full bg-[#DCFCE7] text-[#16A34A] font-medium border border-green-200">Arrived</span>;
      default: return <span className="px-2 py-1 text-xs rounded-full bg-gray-50 text-gray-500 font-medium border border-gray-200">Waiting</span>;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden flex flex-col h-full shadow-sm">
      <div className="p-4 border-b border-[#E5E7EB] bg-gray-50/50 flex justify-between items-center shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Emergency Fleet Live Status Table</h2>
          <p className="text-xs text-gray-500">Global fleet operations overview</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search ID or Label..." 
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-[#7C6FEF] outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      <div className="overflow-x-auto flex-grow min-h-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase font-bold text-gray-500 border-b border-gray-200 tracking-wider">
              <th className="px-5 py-3.5">Vehicle ID</th>
              <th className="px-5 py-3.5">Label</th>
              <th className="px-5 py-3.5">Type</th>
              <th className="px-5 py-3.5">Priority</th>
              <th className="px-5 py-3.5">Current Location</th>
              <th className="px-5 py-3.5">Destination Node</th>
              <th className="px-5 py-3.5">ETA</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center py-12 text-gray-400 text-xs italic">No vehicles found</td>
              </tr>
            ) : (
              filtered.map((v) => {
                const Icon = typeIcons[v.type] || Car;
                return (
                  <tr key={v.id} className="hover:bg-gray-50/50 text-xs text-gray-700 transition-colors">
                    <td className="px-5 py-3 font-semibold text-gray-900">{v.id}</td>
                    <td className="px-5 py-3 font-medium">{v.label}</td>
                    <td className="px-5 py-3 font-medium capitalize flex items-center gap-1.5 mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-gray-400" />
                      <span>{v.type}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        v.priority === 1 ? 'bg-red-100 text-red-700' : v.priority === 2 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        Priority {v.priority}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono font-medium text-gray-500">{v.currentNode}</td>
                    <td className="px-5 py-3 font-mono font-medium text-gray-500">{v.destinationNode}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{Math.round(v.eta / 60)} min</td>
                    <td className="px-5 py-3">{getStatusBadge(v.status)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
