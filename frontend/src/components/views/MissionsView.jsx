import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useUIStore from '../../store/useUIStore';
import MissionQueue, { MissionRow } from '../panels/MissionQueue';
import MissionDetail from '../panels/MissionDetail';
import { Panel, Button, EmptyState } from '../common/ui';
import { MISSION_STATUS } from '../../domain/constants';
import { Inbox } from 'lucide-react';

export default function MissionsView() {
  const missions = useWorldStore((s) => s.missions);
  const setShowMissionDialog = useUIStore((s) => s.setShowMissionDialog);
  const [tab, setTab] = useState('open');

  const closed = missions.filter(
    (m) => m.status === MISSION_STATUS.COMPLETED || m.status === MISSION_STATUS.CANCELLED,
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[
            { id: 'open', label: `Open calls (${missions.length - closed.length})` },
            { id: 'history', label: `History (${closed.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                tab === t.id ? 'bg-[#111827] text-white' : 'bg-white border border-[#E5E7EB] text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowMissionDialog(true)}>
          <Plus className="w-3.5 h-3.5" />
          New mission
        </Button>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel
          title={tab === 'open' ? 'Dispatch queue' : 'Mission history'}
          subtitle={
            tab === 'open'
              ? 'Calls awaiting approval and missions currently running'
              : 'Completed and cancelled missions'
          }
          className="min-h-[420px]"
        >
          {tab === 'open' ? (
            <MissionQueue />
          ) : closed.length === 0 ? (
            <EmptyState icon={Inbox} title="No closed missions yet" hint="Completed missions appear here with their timings." />
          ) : (
            <div className="space-y-2">
              {closed.map((m) => (
                <MissionRow key={m.id} mission={m} compact />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Mission detail" subtitle="Route, comparison and timeline for the selected mission" className="min-h-[420px]">
          <MissionDetail />
        </Panel>
      </div>
    </div>
  );
}
