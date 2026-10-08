import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';

export default function ResearchNote() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden mb-6">
      <div 
        className="p-4 bg-gray-50 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-gray-800 font-semibold">
          <BookOpen className="w-5 h-5 text-[#7C6FEF]" />
          Research & Methodology
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </div>
      
      {expanded && (
        <div className="p-6 text-sm text-gray-700 space-y-6">
          <section>
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7C6FEF]"></span> Algorithms
            </h4>
            <p className="leading-relaxed">
              <span className="font-mono bg-gray-100 px-1 rounded text-[#7C6FEF]">A* Pathfinding</span> with haversine heuristic is used for optimal routing across the node grid. 
              Dijkstra's algorithm is retained as a fallback for benchmarking and comparison. 
              Yen's k-shortest paths algorithm is utilized for dynamic alternative route discovery when a node becomes blocked.
            </p>
          </section>

          <div className="h-px bg-gray-100 w-full"></div>

          <section>
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7C6FEF]"></span> V2X Communication
            </h4>
            <p className="leading-relaxed">
              Vehicle-to-Everything (V2X) enables real-time data exchange between vehicles and infrastructure. 
              Our system leverages <span className="font-semibold text-gray-900">C-V2X (Cellular V2X)</span> over 5G-URLLC to share telemetry, 
              node blockages, and dispatch commands with sub-millisecond latency.
            </p>
          </section>

          <div className="h-px bg-gray-100 w-full"></div>

          <section>
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7C6FEF]"></span> 5G-URLLC & Green Wave
            </h4>
            <p className="leading-relaxed mb-3">
              Ultra-Reliable Low-Latency Communication provides &lt;1ms latency with 99.999% reliability for safety-critical V2X messages.
            </p>
            <p className="leading-relaxed">
              The <span className="font-semibold text-[#16A34A]">Green Wave</span> effect is achieved via coordinated traffic signal timing along the corridor. 
              As high-priority emergency vehicles approach intersections, signals pre-emptively turn green, creating continuous uninterrupted flow.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
