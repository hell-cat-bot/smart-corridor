import React from 'react';
import useSettingsStore from '../../store/useSettingsStore';
import useVehicleStore from '../../store/useVehicleStore';
import useDisasterStore from '../../store/useDisasterStore';
import useGridStore from '../../store/useGridStore';
import useActivityLogStore from '../../store/useActivityLogStore';
import useUIStore from '../../store/useUIStore';
import { Sliders, Eye, ShieldAlert, RotateCcw, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPanel() {
  const maxDisasters = useSettingsStore((s) => s.maxDisasters);
  const setMaxDisasters = useSettingsStore((s) => s.setMaxDisasters);
  const showMapLabels = useSettingsStore((s) => s.showMapLabels);
  const setShowMapLabels = useSettingsStore((s) => s.setShowMapLabels);
  const showCongestionOverlay = useSettingsStore((s) => s.showCongestionOverlay);
  const setShowCongestionOverlay = useSettingsStore((s) => s.setShowCongestionOverlay);
  const animateVehicles = useSettingsStore((s) => s.animateVehicles);
  const setAnimateVehicles = useSettingsStore((s) => s.setAnimateVehicles);
  const priorityWeights = useSettingsStore((s) => s.priorityWeights);
  const setPriorityWeight = useSettingsStore((s) => s.setPriorityWeight);

  const resetVehicles = useVehicleStore((s) => s.resetVehicles);
  const resetDisasters = useDisasterStore((s) => s.resetDisasters);
  const resetGrid = useGridStore((s) => s.resetGrid);
  const clearLog = useActivityLogStore((s) => s.clearLog);
  const setTimelineIndex = useUIStore((s) => s.setTimelineIndex);
  const setIsPlaying = useUIStore((s) => s.setIsPlaying);

  const handleSystemReset = () => {
    setIsPlaying(false);
    setTimelineIndex(0);
    resetVehicles();
    resetDisasters();
    resetGrid();
    clearLog();
    toast.success('System state reset to initial demo configuration');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Grid & Disaster Config */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
          <Sliders className="w-5 h-5 text-[#7C6FEF]" />
          <h3 className="text-base font-semibold text-gray-900">Grid & Disaster Configuration</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <label className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
              <span>Grid Dimension (NxN Intersections)</span>
              <span className="text-gray-400 font-mono">6x6 (36 Nodes)</span>
            </label>
            <input type="range" min="4" max="10" value="6" disabled className="w-full opacity-40 cursor-not-allowed" />
            <p className="text-[11px] text-gray-400 mt-1">Configured for Silchar/Connaught Place test grid corridor.</p>
          </div>

          <div>
            <label className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
              <span>Max Allowed Disaster Zones</span>
              <span className="text-[#7C6FEF] font-bold">{maxDisasters}</span>
            </label>
            <input 
              type="range" min="1" max="10" 
              value={maxDisasters} 
              onChange={e => {
                const val = parseInt(e.target.value);
                setMaxDisasters(val);
                toast.info(`Max disaster limit set to ${val}`);
              }} 
              className="w-full accent-[#7C6FEF]" 
            />
            <p className="text-[11px] text-gray-400 mt-1">Prevents over-blocking grid corridors during simulation testing.</p>
          </div>
        </div>
      </div>

      {/* Priority Weighting */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
          <ShieldAlert className="w-5 h-5 text-[#DC2626]" />
          <h3 className="text-base font-semibold text-gray-900">V2X Routing Priority Weights</h3>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-4 rounded-lg border border-red-100 bg-red-50/40">
            <label className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
              <span>Ambulance Weight</span>
              <span className="text-red-600 font-bold">{priorityWeights.ambulance.toFixed(1)}x</span>
            </label>
            <input 
              type="range" min="0.5" max="3.0" step="0.1" 
              value={priorityWeights.ambulance} 
              onChange={e => setPriorityWeight('ambulance', parseFloat(e.target.value))} 
              className="w-full accent-red-500" 
            />
            <p className="text-[10px] text-gray-500 mt-2">Green Wave signal preemption priority</p>
          </div>

          <div className="p-4 rounded-lg border border-orange-100 bg-orange-50/40">
            <label className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
              <span>Fire Truck Weight</span>
              <span className="text-orange-600 font-bold">{priorityWeights.firetruck.toFixed(1)}x</span>
            </label>
            <input 
              type="range" min="0.5" max="3.0" step="0.1" 
              value={priorityWeights.firetruck} 
              onChange={e => setPriorityWeight('firetruck', parseFloat(e.target.value))} 
              className="w-full accent-orange-500" 
            />
            <p className="text-[10px] text-gray-500 mt-2">Emergency corridor priority weight</p>
          </div>

          <div className="p-4 rounded-lg border border-blue-100 bg-blue-50/40">
            <label className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
              <span>Regular Vehicle Weight</span>
              <span className="text-blue-600 font-bold">{priorityWeights.regular.toFixed(1)}x</span>
            </label>
            <input 
              type="range" min="0.1" max="2.0" step="0.1" 
              value={priorityWeights.regular} 
              onChange={e => setPriorityWeight('regular', parseFloat(e.target.value))} 
              className="w-full accent-blue-500" 
            />
            <p className="text-[10px] text-gray-500 mt-2">Standard civilian traffic priority</p>
          </div>
        </div>
      </div>

      {/* Display & Map Toggles */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
          <Eye className="w-5 h-5 text-green-600" />
          <h3 className="text-base font-semibold text-gray-900">Map Display Settings</h3>
        </div>
        <div className="space-y-4 max-w-md">
          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
            <div>
              <span className="text-xs font-semibold text-gray-800 block">Show Map Text Labels</span>
              <span className="text-[11px] text-gray-500">Displays floating name tags on vehicles & disasters</span>
            </div>
            <button 
              onClick={() => {
                setShowMapLabels(!showMapLabels);
                toast.success(`Map text labels ${!showMapLabels ? 'enabled' : 'disabled'}`);
              }}
              className={`w-11 h-6 rounded-full p-1 transition-colors relative ${showMapLabels ? 'bg-[#7C6FEF]' : 'bg-gray-300'}`}
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${showMapLabels ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
            <div>
              <span className="text-xs font-semibold text-gray-800 block">Show Congestion Heat Overlay</span>
              <span className="text-[11px] text-gray-500">Highlights node traffic density on map</span>
            </div>
            <button 
              onClick={() => {
                setShowCongestionOverlay(!showCongestionOverlay);
                toast.success(`Congestion heat ${!showCongestionOverlay ? 'enabled' : 'disabled'}`);
              }}
              className={`w-11 h-6 rounded-full p-1 transition-colors relative ${showCongestionOverlay ? 'bg-[#7C6FEF]' : 'bg-gray-300'}`}
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${showCongestionOverlay ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
            <div>
              <span className="text-xs font-semibold text-gray-800 block">Smooth 60FPS Vehicle Interpolation</span>
              <span className="text-[11px] text-gray-500">Glides vehicles continuously along road segments</span>
            </div>
            <button 
              onClick={() => {
                setAnimateVehicles(!animateVehicles);
                toast.success(`Vehicle animation ${!animateVehicles ? 'enabled' : 'disabled'}`);
              }}
              className={`w-11 h-6 rounded-full p-1 transition-colors relative ${animateVehicles ? 'bg-[#7C6FEF]' : 'bg-gray-300'}`}
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${animateVehicles ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* System Reset & About */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Reset System Environment</h4>
          <p className="text-xs text-gray-500">Restores initial seed grid, vehicles, disasters, and activity log.</p>
        </div>
        <button 
          onClick={handleSystemReset}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-semibold border border-red-200 transition-colors shadow-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Reset All System State
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-500 text-xs space-y-1">
        <p className="font-bold text-gray-800">Packmen — Smart-Corridor Dashboard</p>
        <p>5G-URLLC + V2X Emergency Vehicle Routing Platform</p>
        <p className="text-gray-400">Team Packmen • NIT Silchar • 5G India Hackathon Round 3</p>
      </div>
    </div>
  );
}
