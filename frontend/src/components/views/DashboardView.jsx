import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  Database,
  ListOrdered,
  RefreshCw,
  Server,
  Timer,
  Radio,
} from 'lucide-react';

import { Badge, Button, Card, EmptyState, Meter, Panel, StatTile } from '../common/ui';
import useAuthStore from '../../store/useAuthStore';
import useConnectionStore from '../../store/useConnectionStore';
import useWorldStore from '../../store/useWorldStore';
import api from '../../lib/apiClient';
import { API_URL, SIM_URL } from '../../lib/config';

const REFRESH_MS = 15000;

/* ------------------------------------------------------------------ pieces */

/**
 * One service's health. The state is carried by the word as well as the colour,
 * so it does not depend on being able to tell green from red.
 */
function ServiceTile({ icon: Icon, name, detail, ok, pending, hint }) {
  const tone = pending
    ? { dot: 'bg-gray-300', text: 'text-gray-500', label: 'Checking' }
    : ok
      ? { dot: 'bg-green-500', text: 'text-green-700', label: 'Online' }
      : { dot: 'bg-red-500', text: 'text-red-700', label: 'Unreachable' };

  return (
    <Card className={`p-4 ${!pending && !ok ? 'border-red-200 bg-red-50/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
          <Icon style={{ width: 18, height: 18 }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold text-gray-900 truncate">{name}</p>
            <span className="flex items-center gap-1 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden />
              <span className={`text-[10px] font-bold ${tone.text}`}>{tone.label}</span>
            </span>
          </div>
          <p className="text-[10.5px] text-gray-500 mt-0.5 truncate" title={detail}>
            {detail}
          </p>
          {hint && <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}

/**
 * A labelled breakdown. Every row names its bucket and shows its number, so the
 * bar is a second reading of the same fact rather than the only one.
 */
function Breakdown({ counts, order, labels, tones, empty }) {
  const total = order.reduce((sum, key) => sum + (counts[key] || 0), 0);
  if (!total) return <EmptyState icon={Database} title={empty} />;

  return (
    <div className="space-y-2.5">
      {order.map((key) => {
        const value = counts[key] || 0;
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[11px] text-gray-600">{labels[key]}</span>
              <span className="text-[11px] font-semibold text-gray-900 tabular-nums">
                {value}
                <span className="text-gray-400 font-normal"> / {total}</span>
              </span>
            </div>
            <Meter value={total ? value / total : 0} tone={tones[key] || 'bg-[#111827]'} />
          </div>
        );
      })}
    </div>
  );
}

const VEHICLE_ORDER = ['idle', 'enroute', 'onscene', 'returning', 'offline'];
const VEHICLE_LABELS = {
  idle: 'Idle at base',
  enroute: 'En route',
  onscene: 'On scene',
  returning: 'Returning',
  offline: 'Offline',
};
const VEHICLE_TONES = {
  idle: 'bg-gray-400',
  enroute: 'bg-[#111827]',
  onscene: 'bg-amber-500',
  returning: 'bg-sky-500',
  offline: 'bg-gray-300',
};

const INCIDENT_ORDER = ['open', 'dispatched', 'resolved', 'cancelled'];
const INCIDENT_LABELS = {
  open: 'Open',
  dispatched: 'Dispatched',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};
const INCIDENT_TONES = {
  open: 'bg-red-500',
  dispatched: 'bg-amber-500',
  resolved: 'bg-green-500',
  cancelled: 'bg-gray-300',
};

function formatSeconds(seconds) {
  if (seconds == null) return '—';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
}

/* -------------------------------------------------------------------- page */

export default function DashboardView() {
  const user = useAuthStore((s) => s.user);
  const source = useConnectionStore((s) => s.source);
  const connectionStatus = useConnectionStore((s) => s.status);

  const unitCount = useWorldStore((s) => s.units.length);
  const missionCount = useWorldStore((s) => s.missions.length);
  const disasterCount = useWorldStore((s) => s.disasters.length);
  const running = useWorldStore((s) => s.running);

  const [overview, setOverview] = React.useState(null);
  const [integration, setIntegration] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      // Settled rather than all: the integration probe talks to a third service,
      // and its being down must not blank out the numbers from this one.
      const [statsResult, integrationResult] = await Promise.allSettled([
        api.stats.overview(),
        api.integration.status(),
      ]);

      if (statsResult.status === 'fulfilled') {
        setOverview(statsResult.value);
        setError(null);
      } else {
        setError(statsResult.reason.message);
      }

      setIntegration(integrationResult.status === 'fulfilled' ? integrationResult.value : null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const collector = integration?.collector;
  const simulation = integration?.simulation;

  const recordsOk = Boolean(overview);
  const simOk = source === 'server' ? connectionStatus === 'connected' : Boolean(simulation?.reachable);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* ---------------------------------------------------------- greeting */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Overview'}
          </h2>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            Everything the three services know, in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {user && (
            <Badge tone="bg-[#F3F4F6] text-[#111827]">
              {user.role === 'admin' ? 'Administrator' : user.role === 'dispatcher' ? 'Dispatcher' : 'Read-only'}
            </Badge>
          )}
          <Button variant="ghost" onClick={load} title="Refresh now">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-3 border-red-200 bg-red-50/60">
          <p className="text-[11.5px] text-red-700">{error}</p>
        </Card>
      )}

      {/* ------------------------------------------------------ service health */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Services</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <ServiceTile
            icon={Database}
            name="Records service"
            detail={API_URL}
            ok={recordsOk}
            pending={loading && !overview}
            hint="Accounts, fleet register, incident and mission history."
          />
          <ServiceTile
            icon={Server}
            name="Simulation service"
            detail={SIM_URL}
            ok={simOk}
            pending={loading && !integration && source !== 'server'}
            hint={
              source === 'server'
                ? `Live stream ${connectionStatus}. Sim clock ${simulation?.simTime != null ? `${Math.round(simulation.simTime)}s` : '—'}.`
                : 'Console is running on the local browser engine.'
            }
          />
          <ServiceTile
            icon={Radio}
            name="History collector"
            detail={collector ? `${collector.status} · ${collector.counts.messages} events seen` : 'No status yet'}
            ok={collector?.status === 'connected'}
            pending={!integration}
            hint={
              collector
                ? `${collector.counts.missionsCreated} missions and ${collector.counts.incidentsCreated} incidents recorded from the simulation.`
                : 'The records service reports this once it has tried to connect.'
            }
          />
        </div>
      </section>

      {/* -------------------------------------------------------------- totals */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Recorded history</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label="Missions recorded"
            value={overview?.totals.missions ?? '—'}
            hint="Every dispatch the system has kept"
            icon={ListOrdered}
            tone="bg-gray-100 text-gray-900"
          />
          <StatTile
            label="Open incidents"
            value={overview?.incidentsByStatus.open ?? '—'}
            hint={`${overview?.totals.incidents ?? 0} reported in total`}
            icon={AlertTriangle}
            tone="bg-red-50 text-red-600"
            alert={Boolean(overview?.incidentsByStatus.open)}
          />
          <StatTile
            label="Average response"
            value={formatSeconds(overview?.averageResponseSeconds)}
            hint="Dispatch to completion, simulated seconds"
            icon={Timer}
            tone="bg-amber-50 text-amber-600"
          />
        </div>
      </section>

      {/* --------------------------------------------------------- breakdowns */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Fleet" subtitle="Registered vehicles by current status">
          {overview ? (
            <Breakdown
              counts={overview.vehiclesByStatus}
              order={VEHICLE_ORDER}
              labels={VEHICLE_LABELS}
              tones={VEHICLE_TONES}
              empty="No vehicles registered yet"
            />
          ) : (
            <EmptyState icon={Ambulance} title="Waiting for the records service" />
          )}
        </Panel>

        <Panel title="Incidents" subtitle="Reported by operators, the detector and the simulation">
          {overview ? (
            <Breakdown
              counts={overview.incidentsByStatus}
              order={INCIDENT_ORDER}
              labels={INCIDENT_LABELS}
              tones={INCIDENT_TONES}
              empty="Nothing reported yet"
            />
          ) : (
            <EmptyState icon={AlertTriangle} title="Waiting for the records service" />
          )}
        </Panel>

        <Panel
          title="Live corridor"
          subtitle={source === 'server' ? 'Streaming from the simulation service' : 'Local browser engine'}
          actions={
            <Link
              to="/operations"
              className="text-[11px] font-semibold text-[#111827] hover:underline whitespace-nowrap"
            >
              Open console →
            </Link>
          }
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-600">Clock</span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-900">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}
                  aria-hidden
                />
                {running ? 'Running' : 'Paused'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-600">Units on the network</span>
              <span className="text-[11px] font-semibold text-gray-900 tabular-nums">{unitCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-600">Missions in the world</span>
              <span className="text-[11px] font-semibold text-gray-900 tabular-nums">{missionCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-600">Junctions blocked</span>
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  disasterCount ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {disasterCount}
              </span>
            </div>

            <div className="pt-2 mt-1 border-t border-[#E5E7EB]">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                {source === 'server'
                  ? 'These numbers come from the simulation service over its WebSocket. Completed missions and raised disasters are written to the records service automatically.'
                  : 'The console is running its own engine in this browser. Nothing here is being recorded as history — switch to the simulation service in the top bar for that.'}
              </p>
            </div>
          </div>
        </Panel>
      </section>

      {/* ------------------------------------------------------------ activity */}
      {overview && (
        <section>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-3.5 h-3.5 text-gray-400" />
              <h3 className="text-[11px] font-semibold text-gray-900">Missions by stage</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(overview.missionsByStatus).map(([status, count]) => (
                <Badge
                  key={status}
                  tone={count > 0 ? 'bg-[#F3F4F6] text-[#111827]' : 'bg-gray-100 text-gray-400'}
                >
                  {status}: {count}
                </Badge>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
