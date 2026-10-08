import React from 'react';
import { toast } from 'sonner';
import { RotateCcw, Play, Layers } from 'lucide-react';
import useSettingsStore from '../../store/useSettingsStore';
import useWorldStore from '../../store/useWorldStore';
import { resetWorld, pushSettings } from '../../lib/simControl';
import { loadScenario } from '../../engine/scenarios';
import { SCENARIOS } from '../../data/worldSeed';
import { UNIT_TYPE } from '../../domain/constants';
import { Panel, Button, KeyValue } from '../common/ui';

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-gray-800">{label}</p>
        {hint && <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${checked ? 'bg-[#111827]' : 'bg-gray-300'}`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </div>
  );
}

function Slider({ label, hint, value, min, max, step, onChange, format = (v) => v }) {
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] font-semibold text-gray-800">{label}</p>
        <span className="text-[11px] font-mono font-bold text-[#111827] tabular-nums">{format(value)}</span>
      </div>
      {hint && <p className="text-[10px] text-gray-500 mt-0.5 mb-1.5 leading-snug">{hint}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#111827]"
      />
    </div>
  );
}

export default function SettingsView() {
  const s = useSettingsStore();
  const scenarioId = useWorldStore((w) => w.scenarioId);
  const setLocal = s.set;

  /**
   * Calibration lives in two places when the simulation backend is driving.
   * This store decides what the browser draws; ml_backend decides how the
   * simulation behaves. Every change is applied here and forwarded there, and
   * `pushSettings` drops the display-only keys the backend does not own.
   * In local mode the forward is a no-op.
   */
  const set = React.useCallback(
    (patch) => {
      setLocal(patch);
      pushSettings(patch);
    },
    [setLocal],
  );

  const setPriorityWeight = React.useCallback(
    (type, weight) => {
      s.setPriorityWeight(type, weight);
      pushSettings({ priorityWeights: { ...useSettingsStore.getState().priorityWeights, [type]: weight } });
    },
    [s],
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 min-h-0">
      <div className="grid xl:grid-cols-3 gap-4">
        <Panel title="Map display" subtitle="What the operations map draws">
          <Toggle label="Junction and unit labels" checked={s.showMapLabels} onChange={(v) => set({ showMapLabels: v })} />
          <Toggle
            label="Traffic congestion heat overlay"
            hint="Soft halo scaled by the live congestion index"
            checked={s.showCongestionOverlay}
            onChange={(v) => set({ showCongestionOverlay: v })}
          />
          <Toggle
            label="Show civilian traffic agents"
            hint="Draws the background population that produces the congestion signal. Costs frames."
            checked={s.showCivilians}
            onChange={(v) => set({ showCivilians: v })}
          />
          <Toggle label="Show facilities" checked={s.showFacilities} onChange={(v) => set({ showFacilities: v })} />
          <Toggle
            label="Draw the road network"
            hint="Road polylines under the basemap, weighted by road class."
            checked={s.showGridEdges}
            onChange={(v) => set({ showGridEdges: v })}
          />
          <Toggle
            label="Show every junction"
            hint="Off by default — only blocked, preempted, congested and facility junctions are drawn until you zoom in."
            checked={s.showAllJunctions}
            onChange={(v) => set({ showAllJunctions: v })}
          />
        </Panel>

        <Panel title="Routing & cost function" subtitle="W(u,v) = d(u,v) × (1 + α·c_v·ω)">
          <Slider
            label="Congestion factor α"
            hint="How strongly the live congestion index inflates segment cost."
            value={s.congestionFactor}
            min={0}
            max={5}
            step={0.1}
            onChange={(v) => set({ congestionFactor: v })}
            format={(v) => v.toFixed(1)}
          />
          <Slider
            label="ω · ambulance"
            hint="Lower means congestion penalises this class less, because preemption clears its approach."
            value={s.priorityWeights[UNIT_TYPE.AMBULANCE]}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(v) => setPriorityWeight(UNIT_TYPE.AMBULANCE, v)}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="ω · fire engine"
            value={s.priorityWeights[UNIT_TYPE.FIRETRUCK]}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(v) => setPriorityWeight(UNIT_TYPE.FIRETRUCK, v)}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="Replan cooldown"
            hint="Minimum simulation seconds between two congestion-driven replans of one unit."
            value={s.replanCooldown}
            min={2}
            max={60}
            step={1}
            onChange={(v) => set({ replanCooldown: v })}
            format={(v) => `${v}s`}
          />
          <Slider
            label="Replan improvement threshold"
            hint="A congestion replan is only accepted when it saves at least this much ETA."
            value={s.replanImprovement}
            min={0.02}
            max={0.5}
            step={0.01}
            onChange={(v) => set({ replanImprovement: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Panel>

        <Panel title="Congestion model" subtitle="The civilian simulation standing in for junction cameras">
          <Slider
            label="Civilian agents"
            value={s.civilianCount}
            min={0}
            max={160}
            step={5}
            onChange={(v) => set({ civilianCount: v })}
          />
          <Slider
            label="EMA smoothing"
            hint="Higher reacts faster but is noisier."
            value={s.congestionSmoothing}
            min={0.02}
            max={0.6}
            step={0.02}
            onChange={(v) => set({ congestionSmoothing: v })}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="Density saturation"
            hint="Agents near a junction needed to read as fully congested."
            value={s.densitySaturation}
            min={1}
            max={12}
            step={0.5}
            onChange={(v) => set({ densitySaturation: v })}
            format={(v) => v.toFixed(1)}
          />
        </Panel>

        <Panel title="Missions & dispatch" subtitle="Approval loop and on-scene handling">
          <Toggle
            label="Auto-approve dispatch"
            hint="Skips the operator approval step — calls dispatch as soon as a unit is suggested."
            checked={s.autoApprove}
            onChange={(v) => set({ autoApprove: v })}
          />
          <Slider
            label="On-scene dwell scale"
            hint="Multiplier on the dwell time defined by each emergency class."
            value={s.dwellScale}
            min={0.2}
            max={2}
            step={0.1}
            onChange={(v) => set({ dwellScale: v })}
            format={(v) => `${v.toFixed(1)}×`}
          />
          <Slider
            label="Maximum active disasters"
            value={s.maxDisasters}
            min={1}
            max={12}
            step={1}
            onChange={(v) => set({ maxDisasters: v })}
          />
        </Panel>

        <Panel title="Signal preemption" subtitle="Green wave behaviour in Operations and the corridor view">
          <Slider
            label="Approach radius"
            hint="Distance at which an emergency unit requests a green."
            value={s.preemptRadius}
            min={80}
            max={700}
            step={10}
            onChange={(v) => set({ preemptRadius: v })}
            format={(v) => `${v} m`}
          />
          <Slider
            label="Release delay"
            hint="How long a junction is held after the unit clears it."
            value={s.releaseDelay}
            min={0}
            max={15}
            step={0.5}
            onChange={(v) => set({ releaseDelay: v })}
            format={(v) => `${v}s`}
          />
          <Slider
            label="Normal signal cycle"
            hint="Background cycle length used in the corridor view when no vehicle is requesting."
            value={s.signalCycle}
            min={6}
            max={60}
            step={2}
            onChange={(v) => set({ signalCycle: v })}
            format={(v) => `${v}s`}
          />
        </Panel>

        <Panel title="Operational scenarios" subtitle="Configured traffic profiles and system baseline reset">
          <div className="space-y-2">
            {SCENARIOS.map((sc) => (
              <div
                key={sc.id}
                className={`rounded-lg border p-2.5 transition-colors ${
                  scenarioId === sc.id
                    ? 'border-slate-900 bg-slate-100/90 shadow-2xs'
                    : 'border-[#CBD5E1] bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-bold text-gray-900">{sc.name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{sc.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      loadScenario(sc.id);
                      toast.success(`Scenario loaded: ${sc.name}`);
                    }}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Load
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
            <Button
              variant="subtle"
              className="w-full"
              onClick={() => {
                s.reset();
                toast.info('Settings restored to defaults');
              }}
            >
              <Layers className="w-3.5 h-3.5" />
              Restore default calibration
            </Button>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                resetWorld();
                toast.warning('All system state reset');
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset all system state
            </Button>
          </div>
        </Panel>

        <Panel title="Platform reference" subtitle="What this build implements" className="xl:col-span-3">
          <div className="grid md:grid-cols-3 gap-x-8 gap-y-1">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Domain model</p>
              <KeyValue label="Missions & legs" value="multi-phase" />
              <KeyValue label="Units & facilities" value="first-class" />
              <KeyValue label="Signals" value="preemption FSM" />
              <KeyValue label="Corridor sessions" value="frozen path" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Simulation</p>
              <KeyValue label="Clock" value={`tick-based, ${1000 / 100} Hz`} />
              <KeyValue label="Shared world state" value="single store" />
              <KeyValue label="Dwell & multi-leg" value="supported" />
              <KeyValue label="Speed" value="1× – 8×" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Connected services</p>
              <KeyValue label="ML / vision detector" value="YOLOv8 + ResNet50" />
              <KeyValue label="5G-URLLC corridor" value="active" />
              <KeyValue label="Records database" value="SQLite live sync" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
            The congestion index is produced here by a background civilian simulation. In a deployed system the same signal would
            come from junction cameras and a vision model; the interface between "observation" and "world state update" is the
            congestion index and the blocked-node set, both of which already exist in this build.
          </p>
        </Panel>
      </div>
    </div>
  );
}
