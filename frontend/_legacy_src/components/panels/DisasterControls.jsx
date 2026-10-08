import React, { useState } from 'react';
import useDisasterStore from '../../store/useDisasterStore';
import useUIStore from '../../store/useUIStore';
import useGridStore from '../../store/useGridStore';
import useActivityLogStore from '../../store/useActivityLogStore';
import { toast } from 'sonner';

export default function DisasterControls() {
  const showDisasterDialog = useUIStore((s) => s.showDisasterDialog);
  const setShowDisasterDialog = useUIStore((s) => s.setShowDisasterDialog);
  const disasters = useDisasterStore((s) => s.disasters);
  const addDisaster = useDisasterStore((s) => s.addDisaster);
  const removeDisaster = useDisasterStore((s) => s.removeDisaster);
  const nodes = useGridStore((s) => s.nodes);
  const blockNode = useGridStore((s) => s.blockNode);
  const clearNode = useGridStore((s) => s.clearNode);
  const addEntry = useActivityLogStore((s) => s.addEntry);

  const [formData, setFormData] = useState({
    type: 'flood',
    node: 'N_2_2',
    severity: 0.8,
    label: ''
  });

  if (!showDisasterDialog) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'severity' ? parseFloat(value) : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const id = `DIS-${Date.now().toString(36).toUpperCase()}`;
    const disaster = {
      id,
      type: formData.type,
      node: formData.node,
      severity: formData.severity,
      timestamp: new Date().toISOString(),
      label: formData.label || `${formData.type.charAt(0).toUpperCase() + formData.type.slice(1)} at ${formData.node}`
    };
    
    addDisaster(disaster);
    blockNode(formData.node);
    addEntry('disaster_detected', `Disaster detected: ${disaster.label}`, disaster, 'critical');
    toast.error(`🚨 Disaster placed: ${disaster.label}`);
    setShowDisasterDialog(false);
    setFormData({ type: 'flood', node: 'N_2_2', severity: 0.8, label: '' });
  };

  const handleClear = (d) => {
    removeDisaster(d.id);
    clearNode(d.node);
    addEntry('disaster_cleared', `Disaster cleared: ${d.label}`, { id: d.id }, 'info');
    toast.success('Disaster cleared');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-[#E5E7EB] flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Inject Disaster</h2>
          <button 
            onClick={() => setShowDisasterDialog(false)} 
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input 
              type="text" name="label"
              value={formData.label}
              onChange={handleChange}
              placeholder="e.g., Flash Flood - Sector 3"
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#DC2626] focus:border-transparent outline-none" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select 
                name="type" value={formData.type} onChange={handleChange}
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#DC2626] outline-none"
              >
                <option value="flood">🌊 Flood</option>
                <option value="landslide">🪨 Landslide</option>
                <option value="earthquake">⚡ Earthquake</option>
                <option value="tsunami">🌊 Tsunami</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Node</label>
              <select 
                name="node" value={formData.node} onChange={handleChange}
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#DC2626] outline-none"
              >
                {nodes.map(n => (
                  <option key={n.id} value={n.id}>{n.name || n.id}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
              <span>Severity</span>
              <span className="text-[#DC2626]">{(formData.severity * 100).toFixed(0)}%</span>
            </label>
            <input 
              type="range" name="severity"
              min="0.1" max="1.0" step="0.1"
              value={formData.severity}
              onChange={handleChange}
              className="w-full accent-[#DC2626]" 
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="button"
              onClick={() => setShowDisasterDialog(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#DC2626] rounded-lg hover:bg-red-700 transition-colors"
            >
              Place Disaster
            </button>
          </div>
        </form>

        {disasters.length > 0 && (
          <div className="p-5 bg-gray-50 border-t border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Active Disasters ({disasters.length})</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {disasters.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{d.label}</p>
                    <p className="text-xs text-gray-500">Node: {d.node} · Severity: {(d.severity * 100).toFixed(0)}%</p>
                  </div>
                  <button 
                    onClick={() => handleClear(d)}
                    className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-colors"
                  >
                    Clear
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
