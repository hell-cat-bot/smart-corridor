import React, { useState } from 'react';
import { Search, Truck, ChevronLeft, ChevronRight, Siren, Flame, OctagonAlert } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useUIStore from '../../store/useUIStore';
import { liveEta } from '../../lib/simControl';
import {
  UNIT_TYPE,
  UNIT_STATUS,
  UNIT_STATUS_LABEL,
  ACTIVE_MISSION_STATUSES,
} from '../../domain/constants';
import { formatDuration } from '../../utils/geo';
import { Badge, Meter } from '../common/ui';

const statusTone = {
  [UNIT_STATUS.AVAILABLE]: 'bg-gray-100 text-gray-600',
  [UNIT_STATUS.ASSIGNED]: 'bg-[#F3F4F6] text-[#111827]',
  [UNIT_STATUS.EN_ROUTE]: 'bg-[#DBEAFE] text-[#2563EB]',
  [UNIT_STATUS.ON_SCENE]: 'bg-[#FEF3C7] text-[#D97706]',
  [UNIT_STATUS.TRANSPORTING]: 'bg-[#DCFCE7] text-[#16A34A]',
  [UNIT_STATUS.RETURNING]: 'bg-gray-100 text-gray-500',
};

export function UnitCard({ unit, onSelect, selected }) {
  const missions = useWorldStore((s) => s.missions);
  const mission = missions.find((m) => m.id === unit.missionId);
  const Icon = unit.type === UNIT_TYPE.FIRETRUCK ? Flame : Siren;
  const progress = unit.route && unit.route.total > 0 ? unit.route.travelled / unit.route.total : 0;
  const eta = unit.route ? liveEta(unit) : null;

  return (
    <div
      onClick={onSelect}
      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
        selected ? 'border-slate-900 bg-slate-100/90 shadow-2xs' : 'border-[#E2E8F0] bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          className={`p-1.5 rounded-md shrink-0 ${
            unit.type === UNIT_TYPE.FIRETRUCK ? 'bg-orange-50 text-orange-600 border border-orange-200/60' : 'bg-red-50 text-red-600 border border-red-200/60'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-900 truncate">{unit.label}</span>
            <span className="text-[9px] font-mono text-slate-400">{unit.id}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <Badge tone={statusTone[unit.status]}>{UNIT_STATUS_LABEL[unit.status]}</Badge>
            {unit.blocked && (
              <Badge tone="bg-red-100 text-red-700 border border-red-200">
                <OctagonAlert className="w-2.5 h-2.5" />
                Blocked
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 truncate">
            {mission
              ? `${mission.id} · ${mission.emergencyLabel}`
              : `Base ${unit.baseFacilityId} · ${unit.missionsCompleted} completed`}
          </p>
          {unit.route && (
            <div className="mt-1.5">
              <Meter value={progress} tone={unit.type === UNIT_TYPE.FIRETRUCK ? 'bg-orange-500' : 'bg-red-500'} height="h-1" />
              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5 font-medium">
                <span>{Math.round(progress * 100)}% of leg</span>
                <span>{eta != null ? `ETA ${formatDuration(eta)}` : ''}</span>
              </div>
            </div>
          )}
          {unit.status === UNIT_STATUS.ON_SCENE && (
            <p className="text-[9.5px] text-amber-700 mt-1 font-semibold">
              Dwell {formatDuration(unit.dwellRemaining)} remaining
            </p>
          )}
          {unit.blocked && (
            <p className="text-[9.5px] text-red-700 mt-1 font-semibold leading-snug">
              Held — no route past {unit.blocked.node}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Collapsible fleet rail beside the operations map. */
export default function UnitsPanel() {
  const units = useWorldStore((s) => s.units);
  const missions = useWorldStore((s) => s.missions);
  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const setSelectedUnitId = useUIStore((s) => s.setSelectedUnitId);
  const setSelectedMissionId = useUIStore((s) => s.setSelectedMissionId);
  const setFocusUnitId = useUIStore((s) => s.setFocusUnitId);

  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const activeMissions = missions.filter((m) => ACTIVE_MISSION_STATUSES.includes(m.status)).length;

  const visible = units.filter((u) => {
    if (filter === 'ambulance' && u.type !== UNIT_TYPE.AMBULANCE) return false;
    if (filter === 'firetruck' && u.type !== UNIT_TYPE.FIRETRUCK) return false;
    if (filter === 'busy' && u.status === UNIT_STATUS.AVAILABLE) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return u.label.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
  });

  if (collapsed) {
    return (
      <div className="w-12 shrink-0 bg-white border border-[#E2E8F0] rounded-xl flex flex-col items-center py-3 gap-3">
        <button onClick={() => setCollapsed(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100">
          <ChevronRight className="w-4 h-4" />
        </button>
        <Truck className="w-4 h-4 text-slate-900" />
        <span className="text-[10px] font-bold text-slate-500">{units.length}</span>
      </div>
    );
  }

  const available = units.filter((u) => u.status === UNIT_STATUS.AVAILABLE).length;

  return (
    <div className="w-64 shrink-0 bg-white border border-[#E2E8F0] rounded-xl flex flex-col overflow-hidden shadow-subtle">
      <div className="px-3 py-2.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-900">Fleet</h3>
          <p className="text-[10px] text-slate-500 font-medium">
            {available} available · {activeMissions} active mission{activeMissions === 1 ? '' : 's'}
          </p>
        </div>
        <button onClick={() => setCollapsed(true)} className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2.5 space-y-2 border-b border-[#E2E8F0]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search units"
            className="w-full pl-8 pr-2 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900"
          />
        </div>
        <div className="flex gap-1">
          {[
            { id: 'all', label: 'All' },
            { id: 'ambulance', label: 'EMS' },
            { id: 'firetruck', label: 'Fire' },
            { id: 'busy', label: 'On task' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex-1 px-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                filter === f.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {visible.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic text-center py-6">No units match.</p>
        ) : (
          visible.map((u) => (
            <UnitCard
              key={u.id}
              unit={u}
              selected={selectedUnitId === u.id}
              onSelect={() => {
                setSelectedUnitId(u.id);
                setFocusUnitId(u.id);
                if (u.missionId) setSelectedMissionId(u.missionId);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
