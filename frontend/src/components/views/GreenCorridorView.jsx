import React, { useMemo, useState } from 'react';
import { Play, Square, Plus, Trash2, TrafficCone, Zap, Swords, Clock } from 'lucide-react';
import { toast } from 'sonner';

import useCorridorStore from '../../store/useCorridorStore';
import useSettingsStore from '../../store/useSettingsStore';
import CorridorMap from '../map/CorridorMap';
import { startCorridorSession, stopCorridorSession } from '../../engine/corridor';
import { buildCorridorScenario, describeHub } from '../../engine/corridorPresets';
import { UNIT_TYPE, PRIORITY_LABEL, LIGHT_STATE } from '../../domain/constants';
import { Panel, Button, Badge, Select, Field, StatTile, EmptyState, KeyValue, Meter } from '../common/ui';
import NodePicker from '../common/NodePicker';

/**
 * Presets are laid out on the live road network rather than hard-coded
 * junctions, so they work on whatever area the OSM extract covers. Each vehicle
 * approaches the same hub junction down a different road, with approach lengths
 * scaled to its own speed so they arrive together.
 */
const PRESETS = [
  {
    id: 'single',
    name: 'Single ambulance run',
    description: 'One P1 ambulance. Every signal on its frozen path preempts on approach.',
  },
  {
    id: 'conflict',
    name: 'Two-vehicle junction conflict',
    description: 'A P1 ambulance and a P2 engine reach the hub junction together — priority class decides.',
  },
  {
    id: 'surge',
    name: 'Three-vehicle surge',
    description: 'Two P1 ambulances and a P2 engine converge on one junction — priority, then ETA, then request order.',
  },
];

function CustomBuilder({ rows, setRows }) {
  const update = (i, patch) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-2.5 bg-gray-50/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-700">Vehicle {i + 1}</span>
            {rows.length > 1 && (
              <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">
              <Select value={row.type} onChange={(e) => update(i, { type: e.target.value })}>
                <option value={UNIT_TYPE.AMBULANCE}>Ambulance</option>
                <option value={UNIT_TYPE.FIRETRUCK}>Fire engine</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={row.priority} onChange={(e) => update(i, { priority: Number(e.target.value) })}>
                <option value={1}>{PRIORITY_LABEL[1]}</option>
                <option value={2}>{PRIORITY_LABEL[2]}</option>
                <option value={3}>{PRIORITY_LABEL[3]}</option>
              </Select>
            </Field>
            <Field label="From" className="col-span-2">
              <NodePicker value={row.from} onChange={(id) => update(i, { from: id })} placeholder="Start junction" />
            </Field>
            <Field label="To" className="col-span-2">
              <NodePicker value={row.to} onChange={(id) => update(i, { to: id })} placeholder="Destination junction" />
            </Field>
          </div>
        </div>
      ))}

      {rows.length < 4 && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() =>
            setRows([
              ...rows,
              {
                id: `EV-${rows.length + 1}`,
                label: `EV ${rows.length + 1}`,
                type: UNIT_TYPE.AMBULANCE,
                priority: 1,
                from: null,
                to: null,
              },
            ])
          }
        >
          <Plus className="w-3.5 h-3.5" />
          Add vehicle
        </Button>
      )}
    </div>
  );
}

export default function GreenCorridorView() {
  const session = useCorridorStore();
  const preemptRadius = useSettingsStore((s) => s.preemptRadius);

  const [mode, setMode] = useState('conflict');
  const [rows, setRows] = useState([
    { id: 'EV-1', label: 'Ambulance Alpha', type: UNIT_TYPE.AMBULANCE, priority: 1, from: null, to: null },
  ]);

  const hubName = useMemo(() => describeHub(), []);

  const launch = () => {
    let requests;
    if (mode === 'custom') {
      requests = rows.filter((r) => r.from && r.to && r.from !== r.to);
      if (requests.length === 0) {
        toast.error('Pick a start and a destination for at least one vehicle');
        return;
      }
    } else {
      requests = buildCorridorScenario(mode);
      if (requests.length === 0) {
        toast.error('This network has no junction with enough approaches for that preset — try the custom session');
        return;
      }
    }

    const count = startCorridorSession(requests);
    if (count === 0) {
      toast.error('No feasible corridor path for the selected vehicles');
      return;
    }
    toast.success(`Corridor session started with ${count} vehicle(s)`);
  };

  const preempted = Object.values(session.lights).filter((l) => l.state === LIGHT_STATE.PREEMPT_GREEN).length;
  const contested = Object.values(session.lights).filter((l) => l.contested).length;

  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      {/* ------------------------------------------------------- left column */}
      <div className="w-80 shrink-0 border-r border-[#E2E8F0] bg-white flex flex-col overflow-y-auto p-4 gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <TrafficCone className="w-4 h-4 text-slate-900" />
            Corridor session
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Paths are calculated once at session start and then frozen. Vehicles
            move on the corridor's own clock — disaster injection and continuous
            replanning stay in Operations.
          </p>
        </div>

        {!session.active ? (
          <>
            <div className="space-y-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setMode(p.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    mode === p.id ? 'border-slate-900 bg-slate-100/90 shadow-2xs' : 'border-[#CBD5E1] hover:bg-slate-50'
                  }`}
                >
                  <p className="text-[12px] font-bold text-slate-900">{p.name}</p>
                  <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">{p.description}</p>
                </button>
              ))}
              <button
                onClick={() => setMode('custom')}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  mode === 'custom' ? 'border-slate-900 bg-slate-100/90 shadow-2xs' : 'border-[#CBD5E1] hover:bg-slate-50'
                }`}
              >
                <p className="text-[12px] font-bold text-slate-900">Custom session</p>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Pick your own origins and destinations.</p>
              </button>
            </div>

            {mode === 'custom' && <CustomBuilder rows={rows} setRows={setRows} />}

            <Button onClick={launch} className="w-full !py-2.5">
              <Play className="w-3.5 h-3.5" />
              Start corridor session
            </Button>

            {mode !== 'custom' && (
              <p className="text-[10.5px] text-slate-600 bg-slate-50 border border-[#E2E8F0] rounded-lg p-2.5 leading-relaxed">
                Hub junction for this preset: <span className="font-semibold text-slate-900">{hubName}</span>. Approach legs are
                grown outward from it along different roads.
              </p>
            )}

            <p className="text-[10px] text-slate-400 leading-relaxed">
              Preemption triggers at {preemptRadius} m on approach. Junction contests are resolved by priority class, then ETA to
              the junction, then request order — every decision is written to the structured log.
            </p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Elapsed" value={`${session.elapsed.toFixed(0)}s`} icon={Clock} tone="bg-slate-100 text-slate-700" />
              <StatTile label="Greens granted" value={session.stats.grants} icon={Zap} tone="bg-emerald-50 text-emerald-700" />
              <StatTile label="Conflicts" value={session.stats.conflicts} icon={Swords} tone="bg-amber-50 text-amber-700" />
              <StatTile
                label="Total hold"
                value={`${session.stats.holdSeconds.toFixed(0)}s`}
                icon={Square}
                tone="bg-orange-50 text-orange-700"
              />
            </div>

            <div className="rounded-xl border border-[#E2E8F0] p-3 shadow-2xs">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Vehicles</h4>
              <div className="space-y-2.5">
                {session.vehicles.map((v) => (
                  <div key={v.id} className="text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{v.label}</span>
                      <Badge
                        tone={
                          v.state === 'arrived'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : v.state === 'holding'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                        }
                      >
                        {v.state}
                      </Badge>
                    </div>
                    <div className="mt-1">
                      <Meter value={v.total ? v.travelled / v.total : 0} tone="bg-slate-900" height="h-1" />
                    </div>
                    <div className="flex justify-between text-[9.5px] text-slate-400 mt-0.5">
                      <span>P{v.priority} · {v.granted.length} junction(s) preempted</span>
                      <span>held {v.holdTime.toFixed(1)}s</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] p-3 shadow-2xs">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Signal state</h4>
              <KeyValue label="Signalised junctions" value={Object.keys(session.lights).length} />
              <KeyValue label="Currently preempted" value={preempted} />
              <KeyValue label="Currently contested" value={contested} />
              <KeyValue label="Requests / grants / releases" value={`${session.stats.requests} / ${session.stats.grants} / ${session.stats.releases}`} />
            </div>

            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                stopCorridorSession();
                toast.info('Corridor session ended');
              }}
            >
              <Square className="w-3.5 h-3.5" />
              End session
            </Button>
          </>
        )}
      </div>

      {/* ----------------------------------------------------- map + timeline */}
      <div className="flex-1 flex flex-col min-w-0 p-4 gap-4 overflow-hidden">
        <div className="flex-1 rounded-xl overflow-hidden border border-[#E2E8F0] min-h-[280px] relative shadow-subtle">
          {session.active ? (
            <CorridorMap />
          ) : (
            <div className="h-full bg-slate-50 flex items-center justify-center">
              <EmptyState
                icon={TrafficCone}
                title="No corridor session running"
                hint="Choose a preset on the left and start a session to watch signals preempt along a frozen path."
              />
            </div>
          )}
        </div>

        <div className="h-52 grid md:grid-cols-2 gap-4 shrink-0">
          <Panel title="Signal timeline" subtitle="Requests, grants, holds and releases" bodyClass="p-3">
            {session.events.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No signal activity yet.</p>
            ) : (
              <div className="space-y-1">
                {session.events.slice(0, 40).map((e) => (
                  <div key={e.seq} className="flex items-center gap-2 text-[10.5px]">
                    <span className="font-mono text-slate-400 w-11 shrink-0">{e.t.toFixed(1)}s</span>
                    <Badge
                      tone={
                        e.kind === 'grant'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : e.kind === 'hold'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : e.kind === 'release'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : e.kind === 'arrive'
                                ? 'bg-slate-100 text-slate-900 border border-slate-200'
                                : 'bg-slate-50 text-slate-600 border border-slate-200'
                      }
                    >
                      {e.kind}
                    </Badge>
                    <span className="text-slate-700 truncate">{e.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Junction conflicts" subtitle="Multi-EV arbitration decisions" bodyClass="p-3">
            {session.conflicts.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">
                No junction has been contested yet. The two- and three-vehicle presets are built to force one.
              </p>
            ) : (
              <div className="space-y-2">
                {session.conflicts.map((c) => (
                  <div key={c.seq} className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-900">{c.nodeId}</span>
                      <span className="text-[9.5px] font-mono text-amber-700">{c.t.toFixed(1)}s</span>
                    </div>
                    <p className="text-[10.5px] text-slate-700 mt-0.5">
                      <span className="font-semibold text-slate-900">{c.winner}</span> granted · {c.losers.join(', ')} held
                    </p>
                    <p className="text-[9.5px] text-slate-500 mt-0.5">Rule: {c.reason}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.contenders.map((k) => (
                        <span key={k.unit} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white border border-amber-200 text-slate-600">
                          {k.unit} P{k.priorityClass} eta {k.eta}s
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
