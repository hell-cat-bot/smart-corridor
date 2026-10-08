import React from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useUIStore from '../../store/useUIStore';
import { clearDisasterAtNode, clearAllDisasters } from '../../lib/simControl';
import { Panel, Button, Badge, EmptyState, KeyValue, Meter } from '../common/ui';
import { formatDuration } from '../../utils/geo';

const typeTone = {
  flood: 'bg-sky-50 text-sky-700 border border-sky-200',
  landslide: 'bg-amber-50 text-amber-700 border border-amber-200',
  earthquake: 'bg-rose-50 text-rose-700 border border-rose-200',
  tsunami: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  custom: 'bg-slate-100 text-slate-700 border border-slate-200',
};

export default function DisastersView() {
  const disasters = useWorldStore((s) => s.disasters);
  const nodes = useWorldStore((s) => s.nodes);
  const units = useWorldStore((s) => s.units);
  const simTime = useWorldStore((s) => s.simTime);
  const openDisasterDialog = useUIStore((s) => s.openDisasterDialog);

  return (
    <div className="flex-1 overflow-y-auto p-5 min-h-0">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] text-gray-500">
          A blocked junction is excluded from the routing graph entirely — infinite cost, independent of congestion.
        </p>
        <div className="flex gap-2">
          {disasters.length > 0 && (
            <Button variant="ghost" onClick={clearAllDisasters}>
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </Button>
          )}
          <Button onClick={() => openDisasterDialog(null)}>
            <Plus className="w-3.5 h-3.5" />
            Inject disaster
          </Button>
        </div>
      </div>

      {disasters.length === 0 ? (
        <Panel title="Active disasters" className="min-h-[300px]">
          <EmptyState
            icon={AlertTriangle}
            title="Network clear"
            hint="No junction is currently blocked. Inject a disaster here, or click any junction on the operations map."
          />
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {disasters.map((d) => {
            const node = nodes.find((n) => n.id === d.node);
            const affected = units.filter((u) => u.route?.path.includes(d.node));
            return (
              <div key={d.id} className="bg-white rounded-xl border border-rose-200/90 p-4 shadow-subtle hover:shadow-panel transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge tone={typeTone[d.type] || typeTone.custom}>{d.typeLabel || d.type}</Badge>
                    <h3 className="text-xs font-bold text-slate-900 mt-2 truncate">{d.label}</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">{node?.name ?? d.node}</p>
                    {d.note && <p className="text-[10px] text-slate-400 mt-1 italic leading-snug">{d.note}</p>}
                  </div>
                  <Button variant="danger" onClick={() => clearDisasterAtNode(d.node)}>
                    Clear
                  </Button>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>Severity</span>
                    <span className="font-bold text-slate-800">{Math.round(d.severity * 100)}%</span>
                  </div>
                  <Meter value={d.severity} tone="bg-rose-500" />
                </div>

                <div className="mt-3 pt-2 border-t border-[#E2E8F0]">
                  <KeyValue label="Junction" value={d.node} mono />
                  <KeyValue label="Active for" value={formatDuration(simTime - d.simTime)} />
                  <KeyValue label="Legs crossing it" value={affected.length ? affected.map((u) => u.id).join(', ') : 'none'} />
                  <KeyValue label="Routing" value="Excluded from graph" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
