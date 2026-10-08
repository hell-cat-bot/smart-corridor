import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Plus,
  AlertCircle,
  Radio,
  Zap,
  OctagonAlert,
  Cloud,
  Monitor,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import useUIStore from "../../store/useUIStore";
import useWorldStore from "../../store/useWorldStore";
import useSettingsStore from "../../store/useSettingsStore";
import useAuthStore from "../../store/useAuthStore";
import useConnectionStore from "../../store/useConnectionStore";
import { setSimSource } from "../../lib/simSource";
import { Button } from "../common/ui";
import { formatSimClock } from "../../utils/geo";

const pageTitles = {
  "/dashboard": {
    title: "Dashboard",
    sub: "Service health, recorded history and the state of the live corridor",
  },
  "/operations": {
    title: "Operations",
    sub: "Missions, disasters, live routing and congestion on the corridor grid",
  },
  "/corridor": {
    title: "Green Corridor",
    sub: "Frozen path, signal preemption and multi-vehicle junction arbitration",
  },
  "/missions": {
    title: "Missions",
    sub: "Dispatch queue, active missions and mission history",
  },
  "/fleet": {
    title: "Fleet & Facilities",
    sub: "Response units, hospitals and fire stations",
  },
  "/disasters": { title: "Disasters", sub: "Active blockages on the network" },
  "/analytics": {
    title: "Analytics",
    sub: "Response and corridor performance",
  },
  "/logs": {
    title: "Structured logs",
    sub: "Categorised, traceable record of every system decision",
  },
  "/settings": {
    title: "Settings & calibration",
    sub: "Routing weights, congestion model, signals and demo world",
  },
};

/**
 * Which engine is driving the world, and whether it is actually talking.
 *
 * The state is spelled out in words next to the dot, so it does not rely on
 * telling green from amber from red.
 */
function SourcePill() {
  const source = useConnectionStore((s) => s.source);
  const status = useConnectionStore((s) => s.status);
  const hydrating = useConnectionStore((s) => s.hydrating);
  const lastError = useConnectionStore((s) => s.lastError);

  const server = source === "server";

  const state = !server
    ? { dot: "bg-sky-500", text: "text-sky-700", label: "Local engine" }
    : hydrating
      ? {
          dot: "bg-amber-400 animate-pulse",
          text: "text-amber-700",
          label: "Loading world",
        }
      : status === "connected"
        ? {
            dot: "bg-green-500 animate-pulse",
            text: "text-green-700",
            label: "Live",
          }
        : status === "connecting"
          ? {
              dot: "bg-amber-400 animate-pulse",
              text: "text-amber-700",
              label: "Connecting",
            }
          : { dot: "bg-red-500", text: "text-red-700", label: "Offline" };

  const swap = async () => {
    const next = server ? "local" : "server";
    await setSimSource(next);
    toast.message(
      next === "server"
        ? "Switched to the simulation backend"
        : "Switched to the local browser engine",
      {
        description:
          next === "server"
            ? "The world now comes from ml_backend, and history is recorded."
            : "Nothing is recorded in this mode — it is the offline fallback.",
      },
    );
  };

  return (
    <button
      onClick={swap}
      title={
        server
          ? `Streaming from the simulation backend${lastError ? ` — ${lastError}` : ""}. Click to fall back to the local engine.`
          : "Running the browser engine. Click to connect to the simulation backend."
      }
      className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 transition-colors"
    >
      {server ? (
        <Cloud className="w-3 h-3 text-slate-500" />
      ) : (
        <Monitor className="w-3 h-3 text-slate-500" />
      )}
      <span className={`w-1.5 h-1.5 rounded-full ${state.dot}`} aria-hidden />
      <span className={`text-[10.5px] font-semibold ${state.text}`}>
        {state.label}
      </span>
    </button>
  );
}

/** Who is signed in, and the way out. */
function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const signOut = async () => {
    setOpen(false);
    await logout();
    toast.success("Signed out");
    navigate("/login", { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-900 border border-slate-200 flex items-center justify-center font-bold text-[10px]">
          {initials}
        </span>
        <span className="hidden xl:flex flex-col items-start leading-tight">
          <span className="text-[11px] font-semibold text-slate-900 max-w-[120px] truncate">
            {user.name}
          </span>
          <span className="text-[9.5px] text-slate-500 capitalize">
            {user.role}
          </span>
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-[#E2E8F0] rounded-xl shadow-panel z-[1500] overflow-hidden animate-fade-in"
        >
          <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] bg-slate-50">
            <p className="text-[11.5px] font-semibold text-slate-900 truncate">
              {user.name}
            </p>
            <p className="text-[10.5px] text-slate-500 truncate">{user.email}</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {user.role === "admin"
                ? "Full access, including user management"
                : user.role === "dispatcher"
                  ? "Can dispatch and change records"
                  : "Read-only access"}
            </p>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            role="menuitem"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function LiveClock() {
  const simTime = useWorldStore((s) => s.simTime);
  return (
    <span className="px-2.5 py-1.5 text-[10.5px] font-mono font-bold text-slate-800 tabular-nums">
      {formatSimClock(simTime)}
    </span>
  );
}

export default function TopBar() {
  const location = useLocation();
  const setShowMissionDialog = useUIStore((s) => s.setShowMissionDialog);
  const openDisasterDialog = useUIStore((s) => s.openDisasterDialog);

  const running = useWorldStore((s) => s.running);
  const preempted = useWorldStore((s) => Object.keys(s.lights).length);
  const stranded = useWorldStore(
    (s) => s.units.filter((u) => u.blocked).length,
  );
  const autoApprove = useSettingsStore((s) => s.autoApprove);
  const canWrite = useAuthStore((s) => s.canWrite);

  const page = pageTitles[location.pathname] || pageTitles["/operations"];
  const writable = canWrite();

  return (
    <header className="h-16 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-5 shrink-0 gap-4">
      <div className="min-w-0">
        <h1 className="font-bold text-base text-slate-900 leading-tight truncate">
          {page.title}
        </h1>
        <p className="text-[11px] text-slate-500 truncate">{page.sub}</p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {/* Live system state cluster */}
        <div className="hidden lg:flex items-center divide-x divide-slate-200 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] overflow-hidden">
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] font-semibold text-slate-700">
            <span
              className={`w-1.5 h-1.5 rounded-full ${running ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}
              aria-hidden
            />
            {running ? "Running" : "Paused"}
          </span>
          <LiveClock />
          <span
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[10.5px] font-semibold ${
              preempted > 0 ? "text-emerald-700 font-bold" : "text-slate-400"
            }`}
            title="Junctions currently held green for an emergency vehicle"
          >
            <Zap className="w-3 h-3 text-emerald-600" />
            {preempted} preempted
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1.5 text-[10.5px] font-semibold text-slate-900">
            <Radio className="w-3 h-3 text-blue-600" />
            5G-URLLC
          </span>
        </div>

        <SourcePill />

        {stranded > 0 && (
          <span
            className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200"
            title="Units held because every route to their destination is cut"
          >
            <OctagonAlert className="w-3 h-3" />
            {stranded} STRANDED
          </span>
        )}

        {autoApprove && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            AUTO-APPROVE
          </span>
        )}

        <Button
          variant="ghost"
          onClick={() => openDisasterDialog(null)}
          disabled={!writable}
          title={writable ? "Block a junction" : "Your role is read-only"}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Inject disaster</span>
        </Button>

        <Button
          onClick={() => setShowMissionDialog(true)}
          disabled={!writable}
          title={writable ? "Raise a new call" : "Your role is read-only"}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New mission</span>
        </Button>

        <UserMenu />
      </div>
    </header>
  );
}
