import React from 'react';
import { AlertTriangle, Activity, Ambulance } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import { StatTile } from '../common/ui';
import { ACTIVE_MISSION_STATUSES, UNIT_STATUS } from '../../domain/constants';

/** Headline numbers for the operations view — kept minimal so the map stays the focus. */
export default function StatCards() {
  const active = useWorldStore((s) => s.missions.filter((m) => ACTIVE_MISSION_STATUSES.includes(m.status)).length);
  const available = useWorldStore((s) => s.units.filter((u) => u.status === UNIT_STATUS.AVAILABLE).length);
  const unitsTotal = useWorldStore((s) => s.units.length);
  const meanCongestion = useWorldStore((s) =>
    s.nodes.length ? Math.round((s.nodes.reduce((acc, n) => acc + n.congestion, 0) / s.nodes.length) * 100) : 0,
  );
  const disasters = useWorldStore((s) => s.disasters.length);

  const stats = [
    {
      label: 'Active missions',
      value: active,
      hint: `${available}/${unitsTotal} units available`,
      icon: Ambulance,
      tone: 'bg-gray-100 text-gray-900',
    },
    {
      label: 'Congestion index',
      value: `${meanCongestion}%`,
      hint: 'Mean junction load',
      icon: Activity,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Blocked junctions',
      value: disasters,
      hint: disasters ? 'Disaster injection active' : 'Network clear',
      icon: AlertTriangle,
      tone: 'bg-red-50 text-red-600',
      alert: disasters > 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {stats.map((s) => (
        <StatTile key={s.label} {...s} />
      ))}
    </div>
  );
}
