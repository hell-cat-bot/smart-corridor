import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

export default function MapOverlay() {
  const [showLegend, setShowLegend] = useState(true);

  return (
    <div className="absolute top-4 right-4 z-[1000] text-xs">
      <div className="bg-white/95 backdrop-blur-md border border-[#E5E7EB] shadow-lg rounded-xl overflow-hidden transition-all">
        <div 
          onClick={() => setShowLegend(!showLegend)}
          className="px-3.5 py-2 bg-gray-50/90 border-b border-[#E5E7EB] flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-100 font-bold text-gray-800"
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#7C6FEF]" />
            <span>Vehicles & Path Legend</span>
          </div>
          {showLegend ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>

        {showLegend && (
          <div className="p-3 space-y-3 text-[11px] min-w-[195px]">
            <div>
              <span className="font-bold text-gray-400 uppercase text-[9px] block mb-1.5 tracking-wider">Vehicle Types & Priority</span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-gray-700 font-semibold">Ambulance (Pri 1 - Red)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                  <span className="text-gray-700 font-semibold">Fire Unit (Pri 2 - Orange)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-gray-700 font-semibold">Civilian Car (Pri 3 - Blue)</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-2">
              <span className="font-bold text-gray-400 uppercase text-[9px] block mb-1.5 tracking-wider">Path & Route Lines</span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-1 bg-[#7C6FEF] rounded-full shrink-0" />
                  <span className="text-gray-700 font-medium">Optimal Active Path (Solid)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 border-b-2 border-dashed border-red-400 shrink-0" />
                  <span className="text-gray-600 font-medium">Original Path (Pre-Reroute)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-[#7C6FEF] bg-white shrink-0" />
                  <span className="text-gray-600">Destination Point Ring</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-2">
              <span className="font-bold text-gray-400 uppercase text-[9px] block mb-1.5 tracking-wider">Intersections & Disasters</span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping shrink-0" />
                  <span className="text-gray-800 font-semibold">Disaster Zone (Blocked)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-gray-600">Clear Green Wave Node</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
