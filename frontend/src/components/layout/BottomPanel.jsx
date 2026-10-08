import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GitCommit, ListOrdered, Gauge, History, ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react';
import useUIStore, { BOTTOM_PANEL_MIN, clampBottomPanelHeight } from '../../store/useUIStore';
import useWorldStore from '../../store/useWorldStore';
import useLogStore from '../../store/useLogStore';
import MissionDetail from '../panels/MissionDetail';
import MissionQueue from '../panels/MissionQueue';
import CongestionPanel from '../panels/CongestionPanel';
import LogFeed from '../panels/LogFeed';
import { MISSION_STATUS } from '../../domain/constants';

const tabs = [
  { id: 'mission', label: 'Mission & route', icon: GitCommit, component: MissionDetail },
  { id: 'queue', label: 'Dispatch queue', icon: ListOrdered, component: MissionQueue },
  { id: 'congestion', label: 'Congestion', icon: Gauge, component: CongestionPanel },
  { id: 'log', label: 'Event log', icon: History, component: LogFeed },
];

/** Keyboard resize step, in pixels. */
const STEP = 24;

export default function BottomPanel() {
  const open = useUIStore((s) => s.bottomPanelOpen);
  const setOpen = useUIStore((s) => s.setBottomPanelOpen);
  const height = useUIStore((s) => s.bottomPanelHeight);
  const setHeight = useUIStore((s) => s.setBottomPanelHeight);
  const resetHeight = useUIStore((s) => s.resetBottomPanelHeight);
  const activeTab = useUIStore((s) => s.activeBottomTab);
  const setActiveTab = useUIStore((s) => s.setActiveBottomTab);

  const pendingCount = useWorldStore(
    (s) => s.missions.filter((m) => m.status === MISSION_STATUS.PENDING).length,
  );
  const logCount = useLogStore((s) => s.entries.length);

  const [dragging, setDragging] = useState(false);
  const dragState = useRef(null);

  const counts = { queue: pendingCount, log: logCount };

  /* ------------------------------------------------------------- resizing */

  const onPointerDown = useCallback(
    (e) => {
      if (!open) return;
      e.preventDefault();
      dragState.current = { startY: e.clientY, startHeight: height };
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [open, height],
  );

  useEffect(() => {
    if (!dragging) return;

    // Dragging up grows the panel, so the delta is inverted.
    const onMove = (e) => {
      const state = dragState.current;
      if (!state) return;
      setHeight(state.startHeight + (state.startY - e.clientY));
    };
    const onUp = () => {
      dragState.current = null;
      setDragging(false);
    };

    document.body.classList.add('resizing-v');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      document.body.classList.remove('resizing-v');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, setHeight]);

  // The clamp depends on viewport height, so a shrinking window has to pull the
  // panel back down with it or the map disappears.
  useEffect(() => {
    const onResize = () => setHeight(clampBottomPanelHeight(height));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [height, setHeight]);

  const onHandleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHeight(height + STEP);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHeight(height - STEP);
    } else if (e.key === 'Home') {
      e.preventDefault();
      resetHeight();
    }
  };

  const Active = tabs.find((t) => t.id === activeTab)?.component || MissionDetail;

  return (
    <div
      className={`w-full bg-white border-t border-[#E2E8F0] shadow-[0_-4px_16px_rgba(15,23,42,0.04)] flex flex-col shrink-0 relative ${
        dragging ? '' : 'transition-[height] duration-200'
      }`}
      style={{ height: open ? height : 44 }}
    >
      {/* Resize handle — sits on the top edge, hit area larger than it looks. */}
      {open && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the bottom panel"
          aria-valuenow={height}
          aria-valuemin={BOTTOM_PANEL_MIN}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onDoubleClick={resetHeight}
          onKeyDown={onHandleKeyDown}
          title="Drag to resize · double-click to reset"
          className={`absolute -top-1.5 left-0 right-0 h-3 z-20 flex items-center justify-center cursor-row-resize group
            focus-visible:outline-none`}
        >
          <span
            className={`h-1 w-16 rounded-full transition-colors ${
              dragging ? 'bg-slate-900' : 'bg-slate-300 group-hover:bg-slate-700 group-focus-visible:bg-slate-900'
            }`}
          />
          <GripHorizontal
            className={`w-3.5 h-3.5 absolute transition-opacity ${
              dragging ? 'opacity-0' : 'opacity-0 group-hover:opacity-60 text-slate-500'
            }`}
          />
        </div>
      )}

      <div
        className="h-11 flex items-center justify-between px-5 bg-[#F8FAFC] border-b border-[#E2E8F0] select-none shrink-0"
        onDoubleClick={() => setOpen(!open)}
      >
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const count = counts[tab.id];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (!open) setOpen(true);
                }}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 ${
                    isActive
                      ? 'text-slate-900 bg-white border border-[#E2E8F0] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border border-transparent'
                  }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {count > 0 && (
                  <span
                    className={`ml-0.5 min-w-[16px] px-1.5 rounded-full text-[9px] leading-[15px] font-bold tabular-nums ${
                      isActive ? 'bg-slate-100 text-slate-900' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Collapse panel' : 'Expand panel'}
          className="p-1.5 hover:bg-gray-200 text-gray-400 hover:text-gray-600 rounded-md transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827]/60"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto p-4 bg-white ${open ? 'block' : 'hidden'}`}>
        <Active />
      </div>

      {/* While dragging, swallow pointer events over the content so text does
          not select and iframes/maps do not steal the pointer. */}
      {dragging && <div className="absolute inset-0 z-10 cursor-row-resize" />}
    </div>
  );
}
