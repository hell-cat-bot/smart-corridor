import React, { useEffect, useRef } from 'react';
import useActivityLogStore from '../../store/useActivityLogStore';
import { AlertTriangle, GitBranch, CheckCircle2, PlayCircle, PlusCircle, HelpCircle, Bell } from 'lucide-react';

const logStyles = {
  disaster_detected: { icon: AlertTriangle, color: 'text-red-500 bg-red-50', border: 'border-l-red-500' },
  alert_triggered: { icon: Bell, color: 'text-red-500 bg-red-50', border: 'border-l-red-500' },
  rerouting_triggered: { icon: GitBranch, color: 'text-amber-500 bg-amber-50', border: 'border-l-amber-500' },
  path_found: { icon: CheckCircle2, color: 'text-green-500 bg-green-50', border: 'border-l-green-500' },
  vehicle_arrived: { icon: CheckCircle2, color: 'text-green-500 bg-green-50', border: 'border-l-green-500' },
  vehicle_dispatched: { icon: PlayCircle, color: 'text-blue-500 bg-blue-50', border: 'border-l-blue-500' },
  vehicle_added: { icon: PlusCircle, color: 'text-[#7C6FEF] bg-[#EDE9FE]', border: 'border-l-[#7C6FEF]' },
  disaster_cleared: { icon: CheckCircle2, color: 'text-gray-500 bg-gray-50', border: 'border-l-gray-400' },
};

export default function ActivityLog() {
  const entries = useActivityLogStore((s) => s.entries);
  const clearLog = useActivityLogStore((s) => s.clearLog);
  const containerRef = useRef(null);

  // Auto-scroll to top (newest first) or bottom (oldest first)
  // Let's scroll to top when a new entry is added since we prepend new items
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [entries]);

  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '00:00:00';
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">System Event & Activity Log</h3>
          <p className="text-xs text-gray-500">Real-time V2X status and routing updates</p>
        </div>
        {entries.length > 0 && (
          <button 
            onClick={clearLog}
            className="text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
          >
            Clear Log
          </button>
        )}
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1"
      >
        {entries.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400 italic">
            No system events logged.
          </div>
        ) : (
          entries.map((entry) => {
            const style = logStyles[entry.type] || { icon: HelpCircle, color: 'text-blue-500 bg-blue-50', border: 'border-l-blue-500' };
            const Icon = style.icon;
            return (
              <div 
                key={entry.id} 
                className={`flex items-start gap-3 p-2.5 rounded border border-gray-100/80 bg-gray-50/50 border-l-4 ${style.border} hover:bg-gray-50 transition-colors`}
              >
                <div className={`p-1 rounded-full shrink-0 ${style.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-xs text-gray-700 font-medium leading-relaxed break-words">{entry.message}</p>
                </div>
                <span className="text-[10px] text-gray-400 font-mono self-center shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
