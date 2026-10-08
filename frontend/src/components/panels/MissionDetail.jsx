import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GitCompare, Route as RouteIcon, Camera, Smartphone, Maximize2, X, CheckCircle2, Sparkles } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useUIStore from '../../store/useUIStore';
import useSettingsStore from '../../store/useSettingsStore';
import { planRoute } from '../../utils/pathfinding';
import { omegaFor } from '../../engine/routing';
import { liveEta, approveMission } from '../../lib/simControl';
import { markCitizenReportDispatched } from '../../hooks/useCitizenReportsSync';
import {
  MISSION_STATUS,
  MISSION_STATUS_LABEL,
  LEG_LABEL,
  ACTIVE_MISSION_STATUSES,
} from '../../domain/constants';
import { formatDuration, formatMeters } from '../../utils/geo';
import { Badge, EmptyState, KeyValue, Button, Meter } from '../common/ui';

function PathTrail({ path, blocked = new Set(), highlight = '#111827' }) {
  // Junction ids are compact on a real network; the tooltip carries the name.
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {path.map((id, i) => (
        <span
          key={`${id}-${i}`}
          className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-semibold ${
            blocked.has(id) ? 'bg-red-100 text-red-700 line-through' : 'bg-gray-100 text-gray-600'
          }`}
          style={!blocked.has(id) && (i === 0 || i === path.length - 1) ? { color: highlight } : undefined}
        >
          {id.replace(/^J0*/, '')}
        </span>
      ))}
    </div>
  );
}

/** Route detail for the selected mission, with the A* / comparison split. */
export default function MissionDetail() {
  const selectedMissionId = useUIStore((s) => s.selectedMissionId);
  const missions = useWorldStore((s) => s.missions);
  const units = useWorldStore((s) => s.units);
  const nodes = useWorldStore((s) => s.nodes);
  const edges = useWorldStore((s) => s.edges);
  const disasters = useWorldStore((s) => s.disasters);
  const alpha = useSettingsStore((s) => s.congestionFactor);
  const edgeIndex = useWorldStore((s) => s.edgeIndex);

  const [compareMode, setCompareMode] = useState('auto');
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  const mission = missions.find((m) => m.id === selectedMissionId) || null;
  const unit = mission ? units.find((u) => u.id === mission.unitId) : null;
  const leg = mission && mission.activeLeg >= 0 ? mission.legs[mission.activeLeg] : null;

  const blocked = useMemo(() => new Set(disasters.map((d) => d.node)), [disasters]);
  const congestion = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n.congestion])), [nodes]);

  const dijkstraRoute = useMemo(() => {
    if (!leg) return null;
    return planRoute({
      nodes,
      edges,
      from: leg.path[0],
      to: leg.to,
      blocked,
      congestion,
      alpha,
      omega: omegaFor(unit?.type ?? 'ambulance'),
      unitType: unit?.type ?? 'ambulance',
      algorithm: 'dijkstra',
      edgeIndex,
    });
  }, [leg, nodes, edges, blocked, congestion, alpha, unit?.type, edgeIndex]);

  if (!mission) {
    return (
      <EmptyState
        icon={RouteIcon}
        title="No mission selected"
        hint="Pick a mission from the dispatch queue or click a unit on the map to inspect its route."
      />
    );
  }

  const showOriginal = leg?.originalPath && (compareMode === 'auto' || compareMode === 'original');
  const liveRemaining = unit ? liveEta(unit) : null;
  const photoSrc = mission.photoUri || mission.photoData;

  const timeline = [
    { label: 'Call created', at: mission.createdAt },
    { label: 'Dispatch approved', at: mission.approvedAt },
    { label: 'On scene', at: mission.onSceneAt },
    { label: 'Completed', at: mission.completedAt },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* ------------------------------------------------------- live route */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-subtle">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Live route · A* with live congestion
          </h4>
          <Badge tone="bg-[#F3F4F6] text-[#111827]">{MISSION_STATUS_LABEL[mission.status]}</Badge>
        </div>

        {leg ? (
          <>
            <p className="text-[11px] font-semibold text-gray-800 mb-1">{LEG_LABEL[leg.type] ?? leg.type}</p>
            <KeyValue label="Unit" value={unit?.label ?? '—'} />
            <KeyValue label="Junctions" value={leg.path.length} />
            <KeyValue label="Distance" value={formatMeters(leg.distance)} />
            <KeyValue label="Planned ETA" value={formatDuration(leg.plannedEta)} />
            {liveRemaining != null && ACTIVE_MISSION_STATUSES.includes(mission.status) && (
              <KeyValue label="Remaining ETA" value={formatDuration(liveRemaining)} />
            )}
            <KeyValue label="Replans on this leg" value={leg.replans} />
            <PathTrail path={leg.path} />
          </>
        ) : mission.status === MISSION_STATUS.ON_SCENE ? (
          <div className="py-2 space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                <div>
                  <span className="text-xs font-bold text-amber-900">
                    Unit on scene: {unit?.label ?? 'Assigned unit'}
                  </span>
                  <p className="text-[10px] text-amber-700">
                    Active emergency response underway at scene.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono font-bold text-amber-900 tabular-nums">
                  {formatDuration(unit?.dwellRemaining ?? mission.dwellRemaining ?? 0)}
                </span>
                <p className="text-[9px] text-amber-600 font-semibold uppercase tracking-wider">
                  Dwell remaining
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                <span>On-scene progress</span>
                <span>
                  {Math.round(
                    (1 -
                      Math.max(0, unit?.dwellRemaining ?? mission.dwellRemaining ?? 0) /
                        Math.max(mission.dwellTotal || 1, 1)) *
                      100,
                  )}
                  %
                </span>
              </div>
              <Meter
                value={
                  1 -
                  Math.max(0, unit?.dwellRemaining ?? mission.dwellRemaining ?? 0) /
                    Math.max(mission.dwellTotal || 1, 1)
                }
                tone="bg-amber-500"
                height="h-2"
              />
            </div>

            <p className="text-[10.5px] text-gray-500 italic">
              Leg 2 optimal route (to hospital / base) will be computed and dispatched automatically when dwell timer completes.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 italic py-4">
            {mission.status === MISSION_STATUS.PENDING
              ? 'No leg planned yet — approve the mission to dispatch a unit.'
              : 'Mission has no active leg.'}
          </p>
        )}
      </div>

      {/* -------------------------------------------------------- comparison */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-subtle">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <GitCompare className="w-3.5 h-3.5" />
            Comparison
          </h4>
          <div className="flex gap-1">
            <Button
              variant={showOriginal ? 'primary' : 'ghost'}
              className="!px-2 !py-1 !text-[10px]"
              onClick={() => setCompareMode('original')}
              disabled={!leg?.originalPath}
            >
              Pre-replan
            </Button>
            <Button
              variant={!showOriginal ? 'primary' : 'ghost'}
              className="!px-2 !py-1 !text-[10px]"
              onClick={() => setCompareMode('dijkstra')}
            >
              Dijkstra
            </Button>
          </div>
        </div>

        {showOriginal ? (
          <>
            <p className="text-[11px] font-semibold text-red-600 mb-1">Path before the blockage-driven replan</p>
            <KeyValue label="Junctions" value={leg.originalPath.length} />
            <KeyValue
              label="Blocked nodes on it"
              value={leg.originalPath.filter((id) => blocked.has(id)).join(', ') || 'none (cleared since)'}
            />
            <PathTrail path={leg.originalPath} blocked={blocked} />
            <p className="text-[10px] text-gray-400 mt-2">
              Drawn on the map as the dashed red line for as long as the leg is running.
            </p>
          </>
        ) : leg && dijkstraRoute?.found ? (
          <>
            <p className="text-[11px] font-semibold text-gray-800 mb-1">Dijkstra baseline (no heuristic)</p>
            <KeyValue label="Junctions" value={dijkstraRoute.path.length} />
            <KeyValue label="Distance" value={formatMeters(dijkstraRoute.distance)} />
            <KeyValue label="ETA" value={formatDuration(dijkstraRoute.eta)} />
            <KeyValue label="Nodes expanded" value={dijkstraRoute.expanded} />
            <KeyValue
              label="Same as A*?"
              value={dijkstraRoute.path.join('>') === leg.path.join('>') ? 'identical path' : 'different path'}
            />
            <PathTrail path={dijkstraRoute.path} blocked={blocked} highlight="#0891B2" />
            <p className="text-[10px] text-gray-400 mt-2">
              Both price the same cost function; A* reaches it with fewer expansions thanks to the haversine heuristic.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-gray-400 italic py-4">No leg to compare yet.</p>
        )}
      </div>

      {/* ---------------------------------------------------------- timeline */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-subtle lg:col-span-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Mission timeline</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {timeline.map((step) => (
            <div key={step.label} className="rounded-lg bg-slate-50 border border-[#E2E8F0] p-2.5">
              <p className="text-[10px] text-slate-500 font-medium">{step.label}</p>
              <p className={`text-sm font-semibold tabular-nums ${step.at == null ? 'text-slate-300' : 'text-slate-900'}`}>
                {step.at == null ? '—' : `T+${Math.round(step.at)}s`}
              </p>
            </div>
          ))}
        </div>
        {mission.onSceneAt != null && (
          <p className="text-[11px] text-slate-600 mt-2">
            Response time {formatDuration(mission.onSceneAt - mission.createdAt)}
            {mission.completedAt != null && ` · total mission ${formatDuration(mission.completedAt - mission.createdAt)}`}
          </p>
        )}
        {mission.note && <p className="text-[11px] text-slate-500 mt-2 italic">Caller note: {mission.note}</p>}
      </div>

      {/* --------------------------------------------------- citizen photo section */}
      {(photoSrc || mission.mlAssessment || mission.isCitizenReport) && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 lg:col-span-2 shadow-subtle">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700 border border-[#E2E8F0]">
                <Camera className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Citizen Attached Incident Photo &amp; AI Verdict
                </h4>
                <p className="text-[10px] text-slate-500">Live visual evidence uploaded via mobile SOS app</p>
              </div>
              <Badge tone="bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 text-[10px] font-semibold ml-2">
                <Smartphone className="w-3 h-3" /> Citizen Mobile App
              </Badge>
            </div>
            {photoSrc && (
              <button
                onClick={() => setIsPhotoModalOpen(true)}
                className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1 transition-colors px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 border border-[#CBD5E1] shadow-2xs cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Full Size
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {photoSrc && (
              <div
                className="relative group cursor-pointer overflow-hidden rounded-xl border border-[#CBD5E1] bg-slate-900/5 shrink-0 shadow-2xs"
                onClick={() => setIsPhotoModalOpen(true)}
              >
                <img
                  src={photoSrc}
                  alt="Incident Scene"
                  className="h-36 w-56 object-cover rounded-lg group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1.5 backdrop-blur-[1px]">
                  <Maximize2 className="w-4 h-4" /> Click to enlarge
                </div>
              </div>
            )}

            <div className="min-w-0 flex-1 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Location Scene:</span>
                <span className="font-medium text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-[#E2E8F0] text-[11px]">
                  {mission.sceneNode}
                </span>
              </div>
              {mission.note ? (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10.5px] text-slate-600 font-semibold mb-1">Caller Note &amp; Description:</p>
                  <p className="text-[12px] text-slate-900 italic">"{mission.note}"</p>
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">No additional written note provided by citizen.</p>
              )}

              {mission.status === MISSION_STATUS.PENDING && (
                <div className="pt-2 flex items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={async () => {
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
                    Approve &amp; Dispatch Unit
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* AI Computer Vision Assessment */}
          {mission.mlAssessment && (
            <div className="mt-3.5 p-3.5 rounded-xl bg-slate-50 border border-[#E2E8F0]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="p-1 rounded bg-slate-200 text-slate-800">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    AI Computer Vision Assessment (ResNet-50 &amp; YOLOv8)
                  </span>
                </div>
                <Badge tone={mission.mlAssessment.severity === 'high' ? 'bg-rose-50 text-rose-700 border border-rose-200 font-bold' : 'bg-slate-200 text-slate-800 border border-slate-300 font-bold'}>
                  {mission.mlAssessment.severity?.toUpperCase()} SEVERITY
                </Badge>
              </div>

              <p className="text-[12px] text-slate-800 font-medium mb-3 leading-relaxed bg-white p-2.5 rounded-lg border border-[#E2E8F0] shadow-2xs">
                {mission.mlAssessment.summary}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="p-2 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Hazard Classification</p>
                  <p className="text-xs font-bold text-slate-900 truncate mt-0.5">{mission.mlAssessment.hazardLabel || 'Emergency Scene'}</p>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">ResNet Confidence</p>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">{mission.mlAssessment.hazardConfidence || 88}%</p>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Vehicles In Frame (YOLO)</p>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">{mission.mlAssessment.vehicleCount ?? 0}</p>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">AI Recommended Priority</p>
                  <p className="text-xs font-bold text-blue-600 mt-0.5">Priority {mission.mlAssessment.recommendedPriority || mission.priority}</p>
                </div>
              </div>
            </div>
          )}

          {/* Full resolution inspection modal */}
          {isPhotoModalOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setIsPhotoModalOpen(false)}
            >
              <div
                className="relative max-w-3xl w-full max-h-[90vh] bg-gray-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-gray-700"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-3.5 bg-gray-800/95 border-b border-gray-700 text-white">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold">{mission.id} · Incident Scene Photo Inspection</span>
                  </div>
                  <button
                    onClick={() => setIsPhotoModalOpen(false)}
                    className="p-1 rounded-md hover:bg-gray-700 text-gray-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/60 min-h-[300px]">
                  <img
                    src={photoSrc}
                    alt="Incident Scene High-Res"
                    className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
                  />
                </div>
                {mission.note && (
                  <div className="p-3 bg-gray-800/95 border-t border-gray-700 text-gray-300 text-xs">
                    <span className="font-semibold text-gray-100">Caller note:</span> {mission.note}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
