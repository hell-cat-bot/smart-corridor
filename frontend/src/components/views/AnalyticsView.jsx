import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Gauge,
  GitBranch,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Radio,
  Building2,
  RefreshCw,
} from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useConnectionStore from '../../store/useConnectionStore';
import api from '../../lib/apiClient';
import { Panel, StatTile, KeyValue, Button, Badge, Meter } from '../common/ui';
import { LineChart, BarChart, RankedBars } from '../common/charts';
import { formatDuration } from '../../utils/geo';
import {
  ACTIVE_MISSION_STATUSES,
  NODE_STATUS,
  UNIT_STATUS,
} from '../../domain/constants';

const mean = (arr) => (arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/** Parse duration safely whether timestamps are numbers (sim seconds) or ISO date strings. */
function parseDuration(start, end) {
  if (start == null || end == null) return null;
  if (typeof start === 'number' && typeof end === 'number') {
    const diff = end - start;
    return diff >= 0 ? diff : null;
  }
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isFinite(s) && Number.isFinite(e) && e >= s) {
    return (e - s) / 1000;
  }
  return null;
}

export default function AnalyticsView() {
  const source = useConnectionStore((s) => s.source);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'corridor' | 'history'

  // Backend records state
  const [backendOverview, setBackendOverview] = useState(null);
  const [backendDaily, setBackendDaily] = useState(null);
  const [backendMissions, setBackendMissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Throttled live simulation state (sampled once every 1.5s to prevent high-frequency re-render lag)
  const [liveSnapshot, setLiveSnapshot] = useState(() => {
    const s = useWorldStore.getState();
    return {
      missions: s.missions,
      units: s.units,
      nodes: s.nodes,
      lights: s.lights,
      disasters: s.disasters,
      metrics: s.metrics,
      congestionHistory: s.congestionHistory,
      simTime: s.simTime,
    };
  });

  // Fetch backend records
  const loadBackendData = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewRes, dailyRes, missionsRes] = await Promise.allSettled([
        api.stats.overview(),
        api.stats.daily(14),
        api.missions.list('?limit=50&order=desc'),
      ]);

      if (overviewRes.status === 'fulfilled') setBackendOverview(overviewRes.value);
      if (dailyRes.status === 'fulfilled') setBackendDaily(dailyRes.value);
      if (missionsRes.status === 'fulfilled' && missionsRes.value?.items) {
        setBackendMissions(missionsRes.value.items);
      }
    } catch {
      // Backend not running or token expired; fallback smoothly to live state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackendData();
    const timer = setInterval(loadBackendData, 20000);
    return () => clearInterval(timer);
  }, [loadBackendData]);

  // Sample live simulation world state at a smooth, lag-free cadence (1.5 seconds)
  useEffect(() => {
    const sample = () => {
      const s = useWorldStore.getState();
      setLiveSnapshot({
        missions: s.missions,
        units: s.units,
        nodes: s.nodes,
        lights: s.lights,
        disasters: s.disasters,
        metrics: s.metrics,
        congestionHistory: s.congestionHistory,
        simTime: s.simTime,
      });
    };

    sample();
    const interval = setInterval(sample, 1500);
    return () => clearInterval(interval);
  }, []);

  const {
    missions: liveMissions,
    units,
    nodes,
    lights,
    disasters,
    metrics,
    congestionHistory,
    simTime,
  } = liveSnapshot;

  // Combine live missions with recorded backend missions for rich analytics
  const respondedLive = useMemo(() => {
    return (liveMissions || []).filter((m) => m.onSceneAt != null);
  }, [liveMissions]);

  const liveAvgResponse = useMemo(() => {
    const valid = respondedLive
      .map((m) => parseDuration(m.createdAt, m.onSceneAt))
      .filter((d) => d != null);
    return mean(valid);
  }, [respondedLive]);

  const recordedAvgResponse = backendOverview?.averageResponseSeconds ?? null;
  const avgResponse = liveAvgResponse ?? recordedAvgResponse;

  const efficiency = mean(metrics?.efficiencySamples || []);
  const meanCongestion = nodes?.length ? mean(nodes.map((n) => n.congestion)) : 0;

  // Build clean mission response time series
  const responseSeries = useMemo(() => {
    const series = [];

    // Prioritize live missions that have responded
    for (const m of respondedLive) {
      const duration = parseDuration(m.createdAt, m.onSceneAt);
      if (duration != null && duration > 0) {
        series.push({
          label: String(m.id).replace('M-', 'M'),
          value: Math.round(duration),
          sub: `${m.id} · ${m.emergencyLabel || 'Emergency call'}`,
          createdAt: typeof m.createdAt === 'number' ? m.createdAt : new Date(m.createdAt).getTime(),
        });
      }
    }

    // Include backend recorded missions if live missions are sparse
    if (series.length < 5 && backendMissions?.length > 0) {
      for (const m of backendMissions) {
        const dur = m.actual_seconds ?? parseDuration(m.created_at, m.arrived_at);
        if (dur != null && dur > 0) {
          const idClean = m.sim_mission_id || `M${m.id.slice(0, 4)}`;
          if (!series.some((s) => s.label === idClean)) {
            series.push({
              label: idClean,
              value: Math.round(dur),
              sub: `${idClean} · ${m.notes || m.priority || 'Mission'}`,
              createdAt: new Date(m.created_at).getTime(),
            });
          }
        }
      }
    }

    return series
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-14)
      .map(({ label, value, sub }) => ({ label, value, sub }));
  }, [respondedLive, backendMissions]);

  // Unit workload ranked bars
  const unitLoad = useMemo(() => {
    if (!units || units.length === 0) return [];
    const max = Math.max(1, ...units.map((u) => u.missionsCompleted || 0));
    return units
      .slice()
      .sort((a, b) => (b.missionsCompleted || 0) - (a.missionsCompleted || 0))
      .map((u) => ({
        label: u.label,
        value: (u.missionsCompleted || 0) / max,
        caption: `${u.missionsCompleted || 0} mission(s) · ${u.replanCount || 0} replan(s) · ${u.status}`,
      }));
  }, [units]);

  // Congestion line chart data
  const congestionChartData = useMemo(() => {
    if (congestionHistory && congestionHistory.length >= 2) {
      return congestionHistory.map((h) => ({ x: h.t, y: h.mean * 100 }));
    }
    // Baseline if just starting
    return [
      { x: 0, y: Math.round(meanCongestion * 100) },
      { x: Math.max(simTime, 1), y: Math.round(meanCongestion * 100) },
    ];
  }, [congestionHistory, meanCongestion, simTime]);

  const totalMissionsCount = (backendOverview?.totals.missions ?? 0) + (liveMissions?.length || 0);

  const tiles = [
    {
      label: 'Average response time',
      value: avgResponse == null ? '—' : formatDuration(avgResponse),
      hint: recordedAvgResponse
        ? `${Math.round(recordedAvgResponse)}s recorded historical average`
        : `${respondedLive.length} active run(s) timed`,
      icon: Clock,
      tone: 'bg-green-50 text-green-700',
    },
    {
      label: 'Missions recorded',
      value: totalMissionsCount,
      hint: `${liveMissions.filter((m) => ACTIVE_MISSION_STATUSES.includes(m.status)).length} active live`,
      icon: CheckCircle2,
      tone: 'bg-gray-100 text-gray-900',
    },
    {
      label: 'Network congestion index',
      value: `${Math.round((meanCongestion ?? 0) * 100)}%`,
      hint: `${nodes.filter((n) => n.status === NODE_STATUS.CONGESTED).length} junction(s) congested`,
      icon: Activity,
      tone: 'bg-amber-50 text-amber-700',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
      {/* Top action header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white border border-[#CBD5E1] text-slate-700 hover:bg-slate-50'
            }`}
          >
            System Overview
          </button>
          <button
            onClick={() => setActiveTab('corridor')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'corridor'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white border border-[#CBD5E1] text-slate-700 hover:bg-slate-50'
            }`}
          >
            Live Corridor Telemetry
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white border border-[#CBD5E1] text-slate-700 hover:bg-slate-50'
            }`}
          >
            Operational Records
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={source === 'server' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}>
            {source === 'server' ? 'Connected: Simulation Service' : 'Local Engine Baseline'}
          </Badge>
          <Button variant="ghost" size="sm" onClick={loadBackendData} title="Refresh records">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>

      {/* Main Visualizations */}
      <div className="grid xl:grid-cols-2 gap-4">
        <Panel
          title="Congestion index progression over simulation time"
          subtitle="Dynamic road friction factor c_v priced by A* real-time routing"
        >
          <LineChart
            data={congestionChartData}
            height={170}
            yLabel="%"
            formatY={(v) => `${Math.round(v)}`}
            formatX={(v) => `T+${Math.round(v)}s`}
          />
        </Panel>

        <Panel
          title="Response time by mission"
          subtitle="Call creation to scene arrival duration (seconds) across recent operations"
        >
          <BarChart data={responseSeries} height={170} formatValue={(v) => `${Math.round(v)}`} unit="s" />
        </Panel>

        <Panel title="Fleet unit workload" subtitle="Missions completed per unit across emergency vehicles">
          <RankedBars data={unitLoad} formatValue={(v) => `${Math.round(v * 100)}%`} />
        </Panel>

        <Panel title="Operational infrastructure summary" subtitle="Network nodes, fleet readiness and facilities">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Network & Grid</p>
              <KeyValue label="Road Junctions" value={nodes.length} />
              <KeyValue label="Blocked Junctions" value={disasters.length} />
              <KeyValue label="Active Green Waves" value={Object.keys(lights).length} />
              <KeyValue label="Simulation Time" value={formatDuration(simTime)} />
              <KeyValue label="Rerouted Leg Events" value={metrics.replans} />
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Fleet</p>
              <KeyValue
                label="Units available"
                value={units.filter((u) => u.status === UNIT_STATUS.AVAILABLE).length}
              />
              <KeyValue
                label="Units dispatched"
                value={units.filter((u) => u.status !== UNIT_STATUS.AVAILABLE).length}
              />
              <KeyValue label="Registered fleet" value={backendOverview?.totals.vehicles ?? units.length} />
            </div>
          </div>
        </Panel>
      </div>

      {/* Historical Daily Activity Section */}
      {backendDaily && (
        <div className="grid xl:grid-cols-2 gap-4">
          <Panel title="Daily mission volume" subtitle="Operational dispatches handled over the past 14 days">
            <div className="space-y-2">
              {backendDaily.missions.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-3">No recorded missions in this period.</p>
              ) : (
                backendDaily.missions.map((row) => (
                  <div key={row.day} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                    <span className="font-mono text-slate-600 font-medium">{row.day}</span>
                    <Badge tone="bg-slate-100 text-slate-800 border border-slate-200">{row.total} mission(s)</Badge>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Reported incidents" subtitle="Hazards and incidents logged in database">
            <div className="space-y-2">
              {backendDaily.incidents.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-3">No recorded incidents in this period.</p>
              ) : (
                backendDaily.incidents.map((row) => (
                  <div key={row.day} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                    <span className="font-mono text-slate-600 font-medium">{row.day}</span>
                    <Badge tone="bg-rose-50 text-rose-700 border border-rose-200">{row.total} incident(s)</Badge>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
