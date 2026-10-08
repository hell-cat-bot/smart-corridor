import React from 'react';
import { Globe, Radio, Zap } from 'lucide-react';

export default function FutureWorkStubs() {
  const stubs = [
    {
      title: "3D Visualization",
      icon: <Globe className="w-8 h-8 text-gray-400 mb-4" />,
      desc: "Interactive 3D city model with real-time vehicle tracking and disaster zone visualization"
    },
    {
      title: "V2N/GNB 5G Integration",
      icon: <Radio className="w-8 h-8 text-gray-400 mb-4" />,
      desc: "Direct integration with 5G gNodeB infrastructure for real V2N communication"
    },
    {
      title: "Automated Grievance Escalation",
      icon: <Zap className="w-8 h-8 text-gray-400 mb-4" />,
      desc: "AI-powered automatic priority escalation based on queue depth and disaster severity"
    }
  ];

  return (
    <div className="grid md:grid-cols-3 gap-6 mt-8">
      {stubs.map((stub, idx) => (
        <div key={idx} className="bg-gray-50 border-dashed border-2 border-gray-300 rounded-xl p-6 opacity-60 cursor-not-allowed flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-3 right-3 px-2 py-1 bg-gray-200 text-gray-500 text-[10px] uppercase font-bold rounded-full">
            Coming Soon
          </div>
          {stub.icon}
          <h4 className="font-semibold text-gray-800 mb-2">{stub.title}</h4>
          <p className="text-sm text-gray-500">{stub.desc}</p>
        </div>
      ))}
    </div>
  );
}
