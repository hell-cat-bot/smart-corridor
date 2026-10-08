import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { API_URL } from '../lib/config';
import useWorldStore from '../store/useWorldStore';
import useUIStore from '../store/useUIStore';
import { createMission } from '../engine/missions';

import useConnectionStore from '../store/useConnectionStore';
import sim from '../lib/simClient';

const knownIds = new Set();

export async function markCitizenReportDispatched(reportId) {
  try {
    await fetch(`${API_URL}/api/citizen-reports/${encodeURIComponent(reportId)}/dispatch`, {
      method: 'PATCH',
    });
  } catch {
    // Non-blocking fallback
  }
}

export async function markCitizenReportCancelled(reportId) {
  try {
    await fetch(`${API_URL}/api/citizen-reports/${encodeURIComponent(reportId)}/cancel`, {
      method: 'PATCH',
    });
  } catch {
    // Non-blocking fallback
  }
}

export function useCitizenReportsSync() {
  const isPollingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const res = await fetch(`${API_URL}/api/citizen-reports?limit=50`);
        if (!res.ok) return;
        const reports = await res.json();
        if (cancelled || !Array.isArray(reports)) return;

        const currentMissions = useWorldStore.getState().missions;

        for (const report of reports) {
          const existing = currentMissions.find(
            (m) => m.id === report.id || m.citizenReportId === report.id,
          );

          if (existing) {
            // Keep rich citizen evidence (photo, AI verdict, caller note) attached even if server snapshot missed them
            const hasMissingPhoto = (!existing.photoUri || !existing.photoData) && Boolean(report.photoData);
            const hasMissingMl = !existing.mlAssessment && Boolean(report.mlAssessment);
            const hasMissingNote = !existing.note && Boolean(report.note);

            if (hasMissingPhoto || hasMissingMl || hasMissingNote) {
              useWorldStore.getState().updateMission(existing.id, {
                photoUri: existing.photoUri || report.photoData || null,
                photoData: existing.photoData || report.photoData || null,
                mlAssessment: existing.mlAssessment || report.mlAssessment || null,
                note: existing.note || report.note || '',
                isCitizenReport: true,
                citizenReportId: report.id,
              });
            }
          } else if (report.status === 'pending') {
            if (!knownIds.has(report.id)) {
              knownIds.add(report.id);

              const mission = createMission({
                id: report.id,
                service: report.service,
                emergencyClass: report.emergencyClass,
                emergencyLabel: report.emergencyLabel,
                priority: report.priority,
                sceneNode: report.sceneNode,
                note: report.note,
                photoUri: report.photoData,
                photoData: report.photoData,
                mlAssessment: report.mlAssessment,
                isCitizenReport: true,
                citizenReportId: report.id,
              });

              if (useConnectionStore.getState().source === 'server') {
                sim.missions.create({
                  id: report.id,
                  service: report.service,
                  emergencyClass: report.emergencyClass,
                  sceneNode: report.sceneNode,
                  priority: report.priority,
                  note: report.note,
                  emergencyLabel: report.emergencyLabel,
                }).catch(() => {});
              }

              const mlTag = report.mlAssessment?.mlVerified
                ? ` • 🤖 AI Verified: ${report.mlAssessment.hazardLabel} (${report.mlAssessment.hazardConfidence}%)`
                : '';

              toast.error(`🚨 Citizen Emergency Reported!`, {
                description: `${report.emergencyLabel} at ${report.sceneName || report.sceneNode} (P${report.priority})${mlTag}`,
                duration: 8000,
                action: {
                  label: 'Inspect',
                  onClick: () => {
                    useUIStore.getState().setSelectedMissionId(mission.id);
                  },
                },
              });
            }
          }
        }
      } catch {
        // Backend not reachable, ignore
      } finally {
        isPollingRef.current = false;
      }
    }

    // Initial poll
    poll();

    // Regular interval
    const interval = setInterval(poll, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
}
