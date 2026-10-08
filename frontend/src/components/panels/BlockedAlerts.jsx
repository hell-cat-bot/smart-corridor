import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { OctagonAlert, Crosshair, Ban, XCircle } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useUIStore from '../../store/useUIStore';
import { clearDisasterAtNode, cancelMission } from '../../lib/simControl';
import { formatDuration } from '../../utils/geo';
import { Button } from '../common/ui';

/**
 * Stranded units need to be impossible to miss.
 *
 * A unit is held when a blockage cuts every route to its destination â€” it stops
 * at the stop line rather than driving through, and stays there until the
 * network reopens. That is a silent failure unless the operator is told, so it
 * gets a persistent bar at the top of Operations as well as a toast the moment
 * it happens.
 */
export default function BlockedAlerts() {
  const units = useWorldStore((s) => s.units);
  const nodes = useWorldStore((s) => s.nodes);
  const simTime = useWorldStore((s) => s.simTime);
  const setFocusUnitId = useUIStore((s) => s.setFocusUnitId);
  const setSelectedUnitId = useUIStore((s) => s.setSelectedUnitId);

  const held = units.filter((u) => u.blocked);
  const heldKey = held.map((u) => u.id).join(',');
  const seen = useRef(new Set());

  // Keyed on which units are held, not on the units array â€” that changes every
  // tick and would re-run this ten times a second for nothing. State is read
  // fresh from the store so the narrow dependency stays correct.
  useEffect(() => {
    const world = useWorldStore.getState();
    const current = new Set(world.units.filter((u) => u.blocked).map((u) => u.id));

    for (const id of current) {
      if (seen.current.has(id)) continue;
      const unit = world.units.find((u) => u.id === id);
      if (!unit) continue;
      toast.error(`${unit.label} is stranded`, {
        description: `No route to its destination â€” held short of ${nodeName(world.nodes, unit.blocked.node)}`,
        duration: 8000,
      });
    }
    for (const id of seen.current) {
      if (current.has(id)) continue;
      const unit = world.units.find((u) => u.id === id);
      if (unit) toast.success(`${unit.label} is moving again`);
    }

    seen.current = current;
  }, [heldKey]);

  if (held.length === 0) return null;

  return (
    <div className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 shrink-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-red-100/70 border-b border-red-200">
        <OctagonAlert className="w-4 h-4 text-red-600 shrink-0" />
        <span className="text-[11px] font-bold text-red-800">
          {held.length} unit{held.length === 1 ? '' : 's'} stranded â€” no route to destination
        </span>
        <span className="text-[10px] text-red-600 ml-auto hidden sm:inline">
          Held at the stop line. They resume automatically when a route reopens.
        </span>
      </div>

      <ul className="divide-y divide-red-100">
        {held.map((unit) => (
          <li key={unit.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
            <span className="text-[11px] font-bold text-red-900">{unit.label}</span>
            <span className="text-[10px] font-mono text-red-500">{unit.id}</span>

            <span className="text-[11px] text-red-700">
              blocked at <span className="font-semibold">{nodeName(nodes, unit.blocked.node)}</span>
            </span>

            {unit.missionId && (
              <span className="text-[10px] text-red-600 font-mono">{unit.missionId}</span>
            )}

            <span className="text-[10px] text-red-500">
              held {formatDuration(Math.max(0, simTime - unit.blocked.since))}
            </span>

            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedUnitId(unit.id);
                  setFocusUnitId(unit.id);
                }}
                title="Centre the map on this unit"
              >
                <Crosshair className="w-3 h-3" />
                Focus
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => clearDisasterAtNode(unit.blocked.node)}
                title="Clear the blockage that is holding this unit"
              >
                <Ban className="w-3 h-3" />
                Clear blockage
              </Button>
              {unit.missionId && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => cancelMission(unit.missionId)}
                  title="Stand this unit down"
                >
                  <XCircle className="w-3 h-3" />
                  Cancel mission
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function nodeName(nodes, id) {
  return nodes.find((n) => n.id === id)?.name ?? id;
}

