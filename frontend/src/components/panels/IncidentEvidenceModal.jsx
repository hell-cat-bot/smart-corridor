import React, { useState, useEffect } from 'react';
import {
  Camera,
  Sparkles,
  Smartphone,
  MapPin,
  Flame,
  Siren,
  CheckCircle2,
  X,
  Maximize2,
  AlertTriangle,
  Car,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { Modal, Badge, Button } from '../common/ui';
import {
  SERVICE,
  PRIORITY_TONE,
  PRIORITY_LABEL,
  MISSION_STATUS,
  MISSION_STATUS_LABEL,
} from '../../domain/constants';
import { approveMission, cancelMission } from '../../lib/simControl';
import {
  markCitizenReportDispatched,
  markCitizenReportCancelled,
} from '../../hooks/useCitizenReportsSync';
import { toast } from 'sonner';
import useWorldStore from '../../store/useWorldStore';
import { API_URL } from '../../lib/config';

export default function IncidentEvidenceModal({ isOpen, onClose, mission }) {
  const [showEnlargedPhoto, setShowEnlargedPhoto] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const units = useWorldStore((s) => s.units);
  const nodes = useWorldStore((s) => s.nodes);

  const reportId = mission?.citizenReportId || mission?.id;
  const photoSrc = mission?.photoUri || mission?.photoData;

  const handleRunAiAnalysis = async () => {
    if (!reportId || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_URL}/api/citizen-reports/${encodeURIComponent(reportId)}/analyze`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.mlAssessment) {
          useWorldStore.getState().updateMission(mission.id, {
            mlAssessment: data.mlAssessment,
          });
          toast.success('AI Vision Assessment completed!');
          return;
        }
      }
      toast.error('AI Assessment could not be generated.');
    } catch {
      toast.error('Could not connect to analysis service.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (isOpen && mission && !mission.mlAssessment && (mission.photoUri || mission.photoData)) {
      handleRunAiAnalysis();
    }
  }, [isOpen, mission?.id, mission?.mlAssessment]);

  if (!isOpen || !mission) return null;

  const isFire = mission.service === SERVICE.FIRE;
  const Icon = isFire ? Flame : Siren;
  const tone = PRIORITY_TONE[mission.priority] || PRIORITY_TONE[3];
  const isPending = mission.status === MISSION_STATUS.PENDING;
  const sceneNode = nodes.find((n) => n.id === mission.sceneNode);
  const sceneDisplayName = sceneNode?.name || mission.sceneName || mission.sceneNode;

  const handleApprove = async () => {
    const ok = await approveMission(mission.id);
    if (ok && (mission.isCitizenReport || mission.citizenReportId)) {
      markCitizenReportDispatched(mission.citizenReportId || mission.id);
    }
    toast[ok ? 'success' : 'warning'](
      ok ? `${mission.id} dispatched successfully` : `${mission.id} — no unit available`,
    );
    if (ok) onClose();
  };

  const handleCancel = () => {
    cancelMission(mission.id);
    if (mission.isCitizenReport || mission.citizenReportId) {
      markCitizenReportCancelled(mission.citizenReportId || mission.id);
    }
    toast.info(`${mission.id} call cancelled`);
    onClose();
  };

  const openPhotoInNewTab = () => {
    if (!photoSrc) return;
    const win = window.open('');
    if (win) {
      win.document.write(
        `<html><head><title>${mission.id} - Incident Photo</title><style>body{margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.5);}</style></head><body><img src="${photoSrc}" alt="Incident Visual Evidence" /></body></html>`,
      );
    }
  };

  return (
    <>
      <Modal
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`p-1.5 rounded-lg border ${tone.bg} ${tone.border} shrink-0`}>
              <Icon className={`w-4 h-4 ${tone.text}`} />
            </div>
            <span className="font-bold text-slate-900">{mission.id}</span>
            <span className="text-slate-400">·</span>
            <span className="text-sm font-semibold text-slate-700">Incident Visual Evidence &amp; AI Verdict</span>
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge tone={`${tone.bg} ${tone.text}`}>{PRIORITY_LABEL[mission.priority]}</Badge>
            <Badge tone="bg-slate-100 text-slate-700">{MISSION_STATUS_LABEL[mission.status]}</Badge>
            {mission.isCitizenReport && (
              <Badge tone="bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 font-semibold">
                <Smartphone className="w-3 h-3" /> Citizen SOS App
              </Badge>
            )}
          </div>
        }
        onClose={onClose}
        width="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-slate-500 font-mono">
              Scene: <span className="font-semibold text-slate-800">{sceneDisplayName}</span>
            </div>
            <div className="flex items-center gap-2">
              {isPending && (
                <>
                  <Button variant="danger" size="sm" onClick={handleCancel}>
                    <X className="w-3.5 h-3.5" /> Cancel Call
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApprove}
                    disabled={
                      !mission.suggestedUnitId &&
                      !units.some((u) => u.status === 'available' || u.status === 'returning')
                    }
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve &amp; Dispatch
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Incident Photo Display */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-blue-600" /> Attached Incident Photo
              </span>
              {photoSrc && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openPhotoInNewTab}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" /> Open in tab
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEnlargedPhoto(true)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Maximize2 className="w-3 h-3" /> Full size
                  </button>
                </div>
              )}
            </div>

            {photoSrc ? (
              <div
                onClick={() => setShowEnlargedPhoto(true)}
                className="relative group rounded-xl border border-slate-200 bg-slate-950/5 overflow-hidden flex items-center justify-center cursor-pointer max-h-72 shadow-2xs hover:border-slate-400 transition-colors"
              >
                <img
                  src={photoSrc}
                  alt="Incident Scene"
                  className="w-full max-h-72 object-contain bg-slate-900/10 group-hover:scale-[1.01] transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1.5 backdrop-blur-[1px]">
                  <Maximize2 className="w-4 h-4" /> Click to enlarge
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
                <Camera className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-slate-600">No Photo Attached</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  The caller submitted this emergency report without an image attachment.
                </p>
              </div>
            )}
          </div>

          {/* Caller Description / Note */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Caller Description &amp; Notes
              </span>
            </div>
            {mission.note ? (
              <blockquote className="text-xs text-slate-900 italic bg-white p-3 rounded-lg border border-slate-200 font-medium leading-relaxed shadow-2xs">
                &ldquo;{mission.note}&rdquo;
              </blockquote>
            ) : (
              <p className="text-xs text-slate-400 italic">No additional note provided by the citizen.</p>
            )}

            <div className="mt-2.5 flex items-center gap-4 text-[11px] text-slate-600 flex-wrap">
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Scene: <strong>{sceneDisplayName}</strong> (Node {mission.sceneNode})</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>Class: <strong>{mission.emergencyLabel}</strong></span>
              </div>
            </div>
          </div>

          {/* AI Computer Vision Assessment (ResNet-50 & YOLOv8) */}
          {mission.mlAssessment ? (
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-violet-50/60 via-slate-50 to-indigo-50/40 border border-violet-200/80">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="p-1 rounded bg-violet-100 text-violet-700">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-bold text-violet-950 uppercase tracking-wider">
                    AI Computer Vision Assessment (ResNet-50 &amp; YOLOv8)
                  </span>
                </div>
                <Badge
                  tone={
                    mission.mlAssessment.severity === 'high'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 font-bold'
                      : 'bg-amber-50 text-amber-700 border border-amber-200 font-bold'
                  }
                >
                  {mission.mlAssessment.severity?.toUpperCase()} SEVERITY
                </Badge>
              </div>

              {mission.mlAssessment.summary && (
                <p className="text-xs text-slate-800 font-medium mb-3 leading-relaxed bg-white p-2.5 rounded-lg border border-violet-100 shadow-2xs">
                  {mission.mlAssessment.summary}
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Hazard Type</p>
                  <p className="text-xs font-bold text-slate-900 truncate mt-0.5" title={mission.mlAssessment.hazardLabel}>
                    {mission.mlAssessment.hazardLabel || 'Emergency Scene'}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">ResNet Confidence</p>
                  <p className="text-xs font-bold text-violet-700 mt-0.5">
                    {mission.mlAssessment.hazardConfidence || 0}%
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Vehicles In Frame</p>
                  <p className="text-xs font-bold text-slate-900 mt-0.5 flex items-center justify-center gap-1">
                    <Car className="w-3 h-3 text-slate-500" />
                    {mission.mlAssessment.vehicleCount ?? 0}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">AI Priority</p>
                  <p className="text-xs font-bold text-blue-600 mt-0.5">
                    Priority {mission.mlAssessment.recommendedPriority || mission.priority}
                  </p>
                </div>
              </div>

              {Array.isArray(mission.mlAssessment.detectedObjects) && mission.mlAssessment.detectedObjects.length > 0 && (
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">YOLO Detections:</span>
                  {mission.mlAssessment.detectedObjects.map((obj, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100/70 text-violet-800 border border-violet-200"
                    >
                      {obj}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : isAnalyzing ? (
            <div className="p-3.5 rounded-xl border border-violet-200 bg-violet-50/60 flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin shrink-0" />
                <div>
                  <p className="text-xs font-bold text-violet-950">Generating AI Vision Verdict...</p>
                  <p className="text-[11px] text-slate-600">Running ResNet-50 hazard classification and YOLOv8 vehicle detection.</p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-violet-700 bg-violet-100 px-2 py-1 rounded-md">Analyzing Scene</span>
            </div>
          ) : photoSrc ? (
            <div className="p-3 rounded-xl border border-violet-200 bg-violet-50/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600 shrink-0" />
                <span className="text-xs text-slate-700 font-medium">Visual evidence ready for AI assessment.</span>
              </div>
              <button
                type="button"
                onClick={handleRunAiAnalysis}
                disabled={isAnalyzing}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Run AI Analysis</span>
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-slate-500 text-xs flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>No incident photo attached for AI vision assessment.</span>
            </div>
          )}
        </div>
      </Modal>

      {/* Full-screen lightbox when clicking to enlarge */}
      {showEnlargedPhoto && photoSrc && (
        <div
          className="fixed inset-0 z-[3000] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowEnlargedPhoto(false)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[92vh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
              <button
                type="button"
                onClick={openPhotoInNewTab}
                className="px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1 backdrop-blur-sm border border-slate-600 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Full Tab
              </button>
              <button
                type="button"
                onClick={() => setShowEnlargedPhoto(false)}
                className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white flex items-center justify-center backdrop-blur-sm border border-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={photoSrc}
              alt="Incident Scene Full Size"
              className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-2xl border border-slate-700"
            />
            <p className="text-white/80 text-xs mt-3 text-center">
              {mission.id} · {mission.emergencyLabel} at {sceneDisplayName}
              {mission.note ? ` — "${mission.note}"` : ''}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
