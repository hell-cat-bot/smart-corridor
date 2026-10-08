import React from 'react';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import { toggleSim, setSpeed, stepSeconds, resetWorld } from '../../lib/simControl';
import { formatSimClock } from '../../utils/geo';

/**
 * Simulation transport. The clock is real simulation time, not a scripted
 * timeline — playback speed only changes how fast that clock advances.
 */
export default function SimControls() {
  const running = useWorldStore((s) => s.running);
  const speed = useWorldStore((s) => s.speed);
  const simTime = useWorldStore((s) => s.simTime);

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-md border border-[#E2E8F0] shadow-panel rounded-full px-4 py-2 flex items-center gap-3.5">
      <button
        onClick={toggleSim}
        className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 transition-all shadow-sm active:scale-95"
        title={running ? 'Pause simulation' : 'Run simulation'}
      >
        {running ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
      </button>

      <button
        onClick={() => stepSeconds(1)}
        disabled={running}
        className="w-8 h-8 rounded-full text-slate-500 hover:bg-slate-100 flex items-center justify-center disabled:opacity-30 transition-colors"
        title="Step 1 simulation second"
      >
        <SkipForward className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-full border border-slate-200">
        {[1, 2, 4, 8].map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`w-8 h-7 rounded-full text-[11px] font-bold transition-all ${
              speed === s ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Sim clock</span>
        <span className="text-xs font-mono font-bold text-slate-900 tabular-nums w-[70px]">{formatSimClock(simTime)}</span>
        <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
      </div>

      <button
        onClick={resetWorld}
        className="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
        title="Reset all system state"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
}
