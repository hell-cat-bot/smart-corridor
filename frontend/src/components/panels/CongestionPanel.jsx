import React from 'react';
import useWorldStore from '../../store/useWorldStore';
import useSettingsStore from '../../store/useSettingsStore';
import { NODE_STATUS } from '../../domain/constants';
import { RankedBars, LineChart } from '../common/charts';
import { KeyValue } from '../common/ui';

/**
 * Live congestion state: what the routing cost function is currently seeing,
 * and where it came from.
 */
export default function CongestionPanel() {
  const nodes = useWorldStore((s) => s.nodes);
  const history = useWorldStore((s) => s.congestionHistory);
  const alpha = useSettingsStore((s) => s.congestionFactor);
  const civilianCount = useSettingsStore((s) => s.civilianCount);
  const smoothing = useSettingsStore((s) => s.congestionSmoothing);

  const ranked = [...nodes]
    .sort((a, b) => b.congestion - a.congestion)
    .slice(0, 8)
    .map((n) => ({
      label: n.name,
      value: n.congestion,
      caption: `${n.id} · ${n.rawDensity?.toFixed(1) ?? 0} agents nearby · ${n.status}`,
    }));

  const mean = nodes.length ? nodes.reduce((s, n) => s + n.congestion, 0) / nodes.length : 0;
  const congested = nodes.filter((n) => n.status === NODE_STATUS.CONGESTED).length;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-[#E5E7EB] p-3">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Busiest junctions right now
        </h4>
        <RankedBars data={ranked} />
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-[#E5E7EB] p-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
            Mean congestion index over time
          </h4>
          <LineChart
            data={history.map((h) => ({ x: h.t, y: h.mean * 100 }))}
            height={120}
            yLabel="%"
            formatY={(v) => `${Math.round(v)}`}
            formatX={(v) => `T+${Math.round(v)}s`}
          />
        </div>

        <div className="rounded-xl border border-[#E5E7EB] p-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Model</h4>
          <KeyValue label="Mean index across grid" value={`${(mean * 100).toFixed(1)}%`} />
          <KeyValue label="Junctions above threshold" value={congested} />
          <KeyValue label="Civilian agents" value={civilianCount} />
          <KeyValue label="EMA smoothing" value={smoothing.toFixed(2)} />
          <KeyValue label="Congestion factor α" value={alpha.toFixed(1)} />
          <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
            Segment cost W(u,v) = d(u,v) × (1 + α·c<sub>v</sub>·ω). Density from the background civilian population is smoothed into
            c<sub>v</sub>; junction status uses hysteresis so badges do not flicker. Blocked junctions are excluded from the graph
            outright, independent of congestion.
          </p>
        </div>
      </div>
    </div>
  );
}
