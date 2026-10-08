import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

const Row = ({ swatch, label }) => (
  <div className="flex items-center gap-2">
    <span className="shrink-0">{swatch}</span>
    <span className="text-gray-600">{label}</span>
  </div>
);

const Section = ({ title, children }) => (
  <div className="border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
    <span className="font-bold text-gray-400 uppercase text-[9px] block mb-1.5 tracking-wider">{title}</span>
    <div className="space-y-1.5">{children}</div>
  </div>
);

export default function MapLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-4 right-4 z-[1000] text-[11px]">
      <div className="bg-white/95 backdrop-blur-md border border-[#E5E7EB] shadow-lg rounded-xl overflow-hidden">
        <button
          onClick={() => setOpen(!open)}
          className="w-full px-3.5 py-2 bg-gray-50/90 border-b border-[#E5E7EB] flex items-center justify-between gap-3 hover:bg-gray-100 font-bold text-gray-800"
        >
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#111827]" />
            Map legend
          </span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </button>

        {open && (
          <div className="p-3 space-y-2.5 min-w-[220px] max-h-[60vh] overflow-y-auto">
            <Section title="Roads">
              <Row swatch={<span className="w-5 h-[3px] rounded-full bg-amber-500 block" />} label="Trunk / motorway" />
              <Row swatch={<span className="w-5 h-[2.5px] rounded-full bg-amber-300 block" />} label="Primary" />
              <Row swatch={<span className="w-5 h-[2px] rounded-full bg-slate-300 block" />} label="Secondary" />
              <Row swatch={<span className="w-5 h-[1.5px] rounded-full bg-slate-200 block" />} label="Tertiary and below" />
            </Section>

            <Section title="Junctions">
              <Row swatch={<span className="w-2.5 h-2.5 rounded-full bg-slate-500 block" />} label="Clear intersection" />
              <Row swatch={<span className="w-2.5 h-2.5 rounded-full bg-orange-600 block" />} label="Congested (c above threshold)" />
              <Row swatch={<span className="w-2.5 h-2.5 rounded-full bg-red-600 block" />} label="Blocked by disaster" />
              <Row
                swatch={<span className="w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-green-300 block" />}
                label="Green wave preemption active"
              />
            </Section>

            <Section title="Routes">
              <Row swatch={<span className="w-5 h-1 rounded-full bg-red-600 block" />} label="Leg 1 — dispatch to scene" />
              <Row swatch={<span className="w-5 h-1 rounded-full bg-green-600 block" />} label="Leg 2 — scene to hospital" />
              <Row swatch={<span className="w-5 border-b-2 border-dashed border-red-400 block" />} label="Path before replan" />
              <Row swatch={<span className="w-5 border-b-2 border-dotted border-slate-400 block" />} label="Return to base (unoptimised)" />
            </Section>

            <Section title="Facilities & units">
              <Row swatch={<span className="w-3 h-3 rounded bg-teal-700 block" />} label="Hospital" />
              <Row swatch={<span className="w-3 h-3 rounded bg-amber-700 block" />} label="Fire station" />
              <Row swatch={<span className="w-2.5 h-2.5 rounded-full bg-red-600 block" />} label="Ambulance" />
              <Row swatch={<span className="w-2.5 h-2.5 rounded-full bg-orange-600 block" />} label="Fire engine" />
              <Row swatch={<span className="w-2 h-2 rounded-full bg-slate-400 block" />} label="Civilian traffic agent" />
              <Row
                swatch={<span className="w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-red-300 block" />}
                label="Held — no route past a blockage"
              />
            </Section>

            <Section title="Note">
              <p className="text-gray-500 leading-snug">
                Plain junction dots appear from zoom 15. Blocked, preempted, congested and facility junctions are always drawn.
              </p>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
