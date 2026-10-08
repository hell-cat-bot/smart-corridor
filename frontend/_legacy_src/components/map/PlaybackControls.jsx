import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import useUIStore from '../../store/useUIStore';
import useVehicleStore from '../../store/useVehicleStore';
import useDisasterStore from '../../store/useDisasterStore';
import useGridStore from '../../store/useGridStore';
import useActivityLogStore from '../../store/useActivityLogStore';
import { mockTimeline } from '../../data/mockTimeline';

const PlaybackControls = () => {
  const isPlaying = useUIStore((s) => s.isPlaying);
  const setIsPlaying = useUIStore((s) => s.setIsPlaying);
  const playbackSpeed = useUIStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useUIStore((s) => s.setPlaybackSpeed);
  const timelineIndex = useUIStore((s) => s.timelineIndex);
  const setTimelineIndex = useUIStore((s) => s.setTimelineIndex);

  const resetVehicles = useVehicleStore((s) => s.resetVehicles);
  const resetDisasters = useDisasterStore((s) => s.resetDisasters);
  const resetGrid = useGridStore((s) => s.resetGrid);
  const clearLog = useActivityLogStore((s) => s.clearLog);

  const handleReset = () => {
    setIsPlaying(false);
    setTimelineIndex(0);
    resetVehicles();
    resetDisasters();
    resetGrid();
    clearLog();
  };

  const totalDuration = mockTimeline[mockTimeline.length - 1]?.time || 17000;
  const currentMs = mockTimeline[timelineIndex]?.time || 0;
  const progressPercent = Math.min((currentMs / totalDuration) * 100, 100);

  const formatMs = (ms) => {
    return (ms / 1000).toFixed(1) + 's';
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-md border border-[#E5E7EB] shadow-lg rounded-full px-5 py-2 flex items-center gap-6">
      
      {/* Play/Pause */}
      <button 
        onClick={() => setIsPlaying(!isPlaying)}
        className="w-10 h-10 rounded-full bg-[#7C6FEF] text-white flex items-center justify-center hover:bg-[#6859eb] transition-all shadow-sm active:scale-95"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* Speed Controls */}
      <div className="flex items-center gap-1 bg-white/50 p-0.5 rounded-full border border-gray-200">
        {[1, 2, 4].map(speed => (
          <button
            key={speed}
            onClick={() => setPlaybackSpeed(speed)}
            className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition-colors ${
              playbackSpeed === speed 
                ? 'bg-[#7C6FEF] text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Dynamic Progress Bar */}
      <div className="flex items-center gap-3 w-44">
        <span className="text-[10px] font-mono font-bold text-gray-500 w-10 text-right">{formatMs(currentMs)}</span>
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#7C6FEF] rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-[10px] font-mono font-bold text-gray-500 w-10">{formatMs(totalDuration)}</span>
      </div>

      {/* Reset */}
      <button 
        onClick={handleReset}
        className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
        title="Reset Simulation"
      >
        <RotateCcw className="w-4 h-4" />
      </button>

    </div>
  );
};

export default PlaybackControls;
