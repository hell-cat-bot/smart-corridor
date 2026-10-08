import React, { useState, useMemo } from 'react';
import useVehicleStore from '../../store/useVehicleStore';
import useUIStore from '../../store/useUIStore';
import useGridStore from '../../store/useGridStore';
import useActivityLogStore from '../../store/useActivityLogStore';
import { toast } from 'sonner';

export default function VehicleForm() {
  const showVehicleDialog = useUIStore((s) => s.showVehicleDialog);
  const setShowVehicleDialog = useUIStore((s) => s.setShowVehicleDialog);
  const addVehicle = useVehicleStore((s) => s.addVehicle);
  const nodes = useGridStore((s) => s.nodes);
  const addEntry = useActivityLogStore((s) => s.addEntry);

  const [type, setType] = useState('ambulance');
  const [label, setLabel] = useState('');
  const [priority, setPriority] = useState(1);
  const [health, setHealth] = useState(100);
  const [startNode, setStartNode] = useState('N_0_0');
  const [destNode, setDestNode] = useState('N_5_5');

  const generatedId = useMemo(() => {
    const prefix = type === 'ambulance' ? 'AMB' : type === 'firetruck' ? 'FT' : 'VH';
    return `${prefix}-${Math.floor(Math.random() * 900) + 100}`;
  }, [type, showVehicleDialog]); // eslint-disable-line

  if (!showVehicleDialog) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const vehicle = {
      id: generatedId,
      label: label || `${type.charAt(0).toUpperCase() + type.slice(1)} ${generatedId}`,
      type,
      priority: parseInt(priority),
      health: parseInt(health),
      currentNode: startNode,
      destinationNode: destNode,
      status: 'waiting',
      eta: Math.floor(Math.random() * 600) + 120,
      heading: 0,
    };
    
    addVehicle(vehicle);
    addEntry('vehicle_added', `New vehicle added: ${vehicle.label} (${vehicle.id})`, vehicle, 'info');
    toast.success(`Vehicle ${vehicle.id} added`);
    setShowVehicleDialog(false);
    setLabel('');
    setType('ambulance');
    setPriority(1);
    setHealth(100);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-[#E5E7EB] flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Add New Vehicle</h2>
          <button onClick={() => setShowVehicleDialog(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle ID</label>
            <input type="text" value={generatedId} disabled className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 text-sm cursor-not-allowed" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input 
              type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., City Hospital Ambulance 1"
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#7C6FEF] focus:border-transparent outline-none" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#7C6FEF] outline-none">
                <option value="ambulance">🚑 Ambulance</option>
                <option value="firetruck">🚒 Fire Truck</option>
                <option value="regular">🚗 Regular</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#7C6FEF] outline-none">
                <option value="1">1 — Critical</option>
                <option value="2">2 — High</option>
                <option value="3">3 — Normal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
              <span>Health / Payload</span>
              <span className="text-[#7C6FEF]">{health}%</span>
            </label>
            <input type="range" min="0" max="100" value={health} onChange={(e) => setHealth(e.target.value)} className="w-full accent-[#7C6FEF]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Node</label>
              <select value={startNode} onChange={(e) => setStartNode(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#7C6FEF] outline-none">
                {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
              <select value={destNode} onChange={(e) => setDestNode(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#7C6FEF] outline-none">
                {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <button type="button" onClick={() => setShowVehicleDialog(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#7C6FEF] rounded-lg hover:bg-[#6C5FDF] transition-colors">
              Add Vehicle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
