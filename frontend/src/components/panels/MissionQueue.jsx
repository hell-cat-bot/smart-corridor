import React from 'react';
import { toast } from 'sonner';
import { Siren, Flame, CheckCircle2, X, Clock, Inbox, Camera, Smartphone, Sparkles } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useUIStore from '../../store/useUIStore';
import { approveMission, cancelMission } from '../../lib/simControl';
import { markCitizenReportDispatched, markCitizenReportCancelled } from '../../hooks/useCitizenReportsSync';
import {
  MISSION_STATUS,
  MISSION_STATUS_LABEL,
  SERVICE,
  PRIORITY_TONE,
  PRIORITY_LABEL,
  ACTIVE_MISSION_STATUSES,
} from '../../domain/constants';
import { Badge, Button, EmptyState } from '../common/ui';
import { formatDuration } from '../../utils/geo';
import IncidentEvidenceModal from './IncidentEvidenceModal';

const statusTone = {
  [MISSION_STATUS.PENDING]: 'bg-gray-100 text-gray-600',
  [MISSION_STATUS.ASSIGNED]: 'bg-[#F3F4F6] text-[#111827]',
  [MISSION_STATUS.EN_ROUTE_SCENE]: 'bg-[#DBEAFE] text-[#2563EB]',
  [MISSION_STATUS.ON_SCENE]: 'bg-[#FEF3C7] text-[#D97706]',
  [MISSION_STATUS.TRANSPORTING]: 'bg-[#DCFCE7] text-[#16A34A]',
  [MISSION_STATUS.COMPLETED]: 'bg-gray-100 text-gray-500',
  [MISSION_STATUS.CANCELLED]: 'bg-gray-100 text-gray-400',
};

export function MissionRow({ mission, compact = false }) {
  const [isInspectOpen, setIsInspectOpen] = React.useState(false);
  const nodes = useWorldStore((s) => s.nodes);
  const units = useWorldStore((s) => s.units);
  const selectedMissionId = useUIStore((s) => s.selectedMissionId);
  const setSelectedMissionId = useUIStore((s) => s.setSelectedMissionId);
  const setFocusUnitId = useUIStore((s) => s.setFocusUnitId);
  const simTime = useWorldStore((s) => s.simTime);

  const Icon = mission.service === SERVICE.FIRE ? Flame : Siren;
  const tone = PRIORITY_TONE[mission.priority] || PRIORITY_TONE[3];
  const scene = nodes.find((n) => n.id === mission.sceneNode);
  const unit = units.find((u) => u.id === (mission.unitId || mission.suggestedUnitId));
  const isPending = mission.status === MISSION_STATUS.PENDING;
  const selected = selectedMissionId === mission.id;

  const age = simTime - mission.createdAt;

  return (
    <div
      onClick={() => {
        setSelectedMissionId(mission.id);
        if (mission.unitId) setFocusUnitId(mission.unitId);
      }}
      className={`p-3 rounded-xl border cursor-pointer transition-all ${
        selected ? 'border-slate-900 bg-slate-100/90 shadow-2xs' : 'border-[#E2E8F0] bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg border ${tone.bg} ${tone.border} shrink-0`}>
            <Icon className={`w-3.5 h-3.5 ${tone.text}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900">{mission.id}</span>
              <Badge tone={`${tone.bg} ${tone.text}`}>{PRIORITY_LABEL[mission.priority]}</Badge>
              <Badge tone={statusTone[mission.status]}>{MISSION_STATUS_LABEL[mission.status]}</Badge>
              {mission.isCitizenReport && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMissionId(mission.id);
                    setIsInspectOpen(true);
                  }}
                  className="cursor-pointer group flex items-center"
                  title="Click to view citizen report & evidence"
                >
                  <Badge tone="bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:bg-emerald-100 group-hover:border-emerald-300 transition-all flex items-center gap-1 font-semibold shadow-2xs">
                    <Smartphone className="w-3 h-3 text-emerald-600" /> App
                  </Badge>
                </button>
              )}
              {Boolean(mission.photoUri || mission.photoData) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMissionId(mission.id);
                    setIsInspectOpen(true);
                  }}
                  className="cursor-pointer group flex items-center"
                  title="Click to view incident photo & AI verdict"
                >
                  <Badge tone="bg-blue-50 text-blue-700 border border-blue-200 group-hover:bg-blue-100 group-hover:border-blue-300 transition-all flex items-center gap-1 font-semibold shadow-2xs">
                    <Camera className="w-3 h-3 text-blue-600" /> Photo
                  </Badge>
                </button>
              )}
              {Boolean(mission.mlAssessment?.mlVerified) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMissionId(mission.id);
                    setIsInspectOpen(true);
                  }}
                  className="cursor-pointer group flex items-center"
                  title={mission.mlAssessment.summary || 'Click to view AI assessment'}
                >
                  <Badge tone="bg-violet-50 text-violet-700 border border-violet-200 group-hover:bg-violet-100 group-hover:border-violet-300 transition-all flex items-center gap-1 font-semibold shadow-2xs">
                    <Sparkles className="w-3 h-3 text-violet-600" /> AI Verified
                  </Badge>
                </button>
              )}
              {mission.status === MISSION_STATUS.ON_SCENE && (
                <Badge tone="bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                  Dwell: {formatDuration(unit?.dwellRemaining ?? mission.dwellRemaining ?? 0)}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-800 font-medium mt-1 truncate">
              {mission.emergencyLabel} · {scene?.name ?? mission.sceneNode}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
              {unit ? `${isPending ? 'Suggested' : 'Assigned'}: ${unit.label}` : 'No unit available'}
              {mission.suggestedEta != null && isPending ? ` · ETA ${formatDuration(mission.suggestedEta)}` : ''}
              {mission.replans > 0 ? ` · ${mission.replans} replan${mission.replans > 1 ? 's' : ''}` : ''}
            </p>
          </div>
        </div>

        {!compact && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(age)}
            </span>
            {isPending && (
              <>
                <Button
                  variant="primary"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await approveMission(mission.id);
                    if (ok && (mission.isCitizenReport || mission.citizenReportId)) {
                      markCitizenReportDispatched(mission.citizenReportId || mission.id);
                    }
                    toast[ok ? 'success' : 'warning'](
                      ok ? `${mission.id} dispatched` : `${mission.id} — no unit available`,
                    );
                  }}
                  disabled={!mission.suggestedUnitId && !units.some((u) => u.status === 'available' || u.status === 'returning')}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve &amp; dispatch
                </Button>
                <Button
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelMission(mission.id);
                    if (mission.isCitizenReport || mission.citizenReportId) {
                      markCitizenReportCancelled(mission.citizenReportId || mission.id);
                    }
                  }}
                  title="Cancel call"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
            {ACTIVE_MISSION_STATUSES.includes(mission.status) && (
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelMission(mission.id);
                }}
              >
                Stand down
              </Button>
            )}
          </div>
        )}
      </div>

      <IncidentEvidenceModal
        isOpen={isInspectOpen}
        onClose={() => setIsInspectOpen(false)}
        mission={mission}
      />
    </div>
  );
}

/** Dispatch queue: pending approvals first, then everything currently running. */
export default function MissionQueue() {
  const missions = useWorldStore((s) => s.missions);

  const pending = missions
    .filter((m) => m.status === MISSION_STATUS.PENDING)
    .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
  const active = missions.filter((m) => ACTIVE_MISSION_STATUSES.includes(m.status));

  if (pending.length === 0 && active.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No open calls"
        hint="Use New mission in the top bar, or click a junction on the map to raise a call there."
      />
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Awaiting approval ({pending.length})
          </h4>
          <span className="text-[10px] text-gray-400">Ordered by priority class, then call time</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic px-1 py-2">Queue clear — nothing waiting on the operator.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((m) => (
              <MissionRow key={m.id} mission={m} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Active missions ({active.length})
        </h4>
        {active.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic px-1 py-2">No missions currently running.</p>
        ) : (
          <div className="space-y-2">
            {active.map((m) => (
              <MissionRow key={m.id} mission={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
