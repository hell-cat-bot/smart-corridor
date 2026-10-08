import React from "react";
import { NavLink } from "react-router-dom";
import {
  Gauge,
  LayoutDashboard,
  TrafficCone,
  ListOrdered,
  Truck,
  AlertTriangle,
  BarChart3,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import useUIStore from "../../store/useUIStore";
import useWorldStore from "../../store/useWorldStore";
import useAuthStore from "../../store/useAuthStore";
import {
  MISSION_STATUS,
  ACTIVE_MISSION_STATUSES,
} from "../../domain/constants";

const navItems = [
  { name: "Dashboard", path: "/dashboard", icon: Gauge, group: "Overview" },
  {
    name: "Operations",
    path: "/operations",
    icon: LayoutDashboard,
    group: "Live",
  },
  {
    name: "Green Corridor",
    path: "/corridor",
    icon: TrafficCone,
    group: "Live",
  },
  {
    name: "Missions",
    path: "/missions",
    icon: ListOrdered,
    group: "Manage",
    badge: "pending",
  },
  { name: "Fleet & Facilities", path: "/fleet", icon: Truck, group: "Manage" },
  {
    name: "Disasters",
    path: "/disasters",
    icon: AlertTriangle,
    group: "Manage",
    badge: "disasters",
  },
  { name: "Analytics", path: "/analytics", icon: BarChart3, group: "Shared" },
  { name: "Logs", path: "/logs", icon: ScrollText, group: "Shared" },
  { name: "Settings", path: "/settings", icon: Settings, group: "Shared" },
];

export default function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const missions = useWorldStore((s) => s.missions);
  const disasters = useWorldStore((s) => s.disasters);
  const user = useAuthStore((s) => s.user);

  const pending = missions.filter(
    (m) => m.status === MISSION_STATUS.PENDING,
  ).length;
  const active = missions.filter((m) =>
    ACTIVE_MISSION_STATUSES.includes(m.status),
  ).length;

  const badgeValue = (key) => {
    if (key === "pending") return pending || null;
    if (key === "disasters") return disasters.length || null;
    return null;
  };

  let lastGroup = null;

  return (
    <div
      className={`bg-white border-r border-[#E2E8F0] flex flex-col transition-all duration-300 h-screen shrink-0 z-40 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="flex items-center h-16 border-b border-[#E2E8F0] px-4 shrink-0 bg-[#F8FAFC]">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="images/logo.png"
            className="w-8 h-8 shrink-0"
            alt="Packmen Logo"
          />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 tracking-tight leading-tight">
                Smart Corridor
              </p>
              <p className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider">
                Control Console
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 flex flex-col gap-0.5 min-h-0">
        {navItems.map((item) => {
          const showGroup = !collapsed && item.group !== lastGroup;
          lastGroup = item.group;
          const badge = badgeValue(item.badge);

          return (
            <React.Fragment key={item.name}>
              {showGroup && (
                <span className="px-2 pt-3 pb-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                  {item.group}
                </span>
              )}
              <NavLink
                to={item.path}
                title={collapsed ? item.name : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all shrink-0 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm shadow-slate-900/10 font-semibold"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 font-medium"
                  } ${collapsed ? "justify-center" : ""}`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <span className="text-[12px] whitespace-nowrap flex-1">
                    {item.name}
                  </span>
                )}
                {!collapsed && badge != null && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-current border border-current/20">
                    {badge}
                  </span>
                )}
              </NavLink>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="p-2.5 border-t border-[#E2E8F0] space-y-2 shrink-0 bg-[#F8FAFC]">
        {!collapsed && (
          <div className="px-2.5 py-2 rounded-lg bg-white border border-[#E2E8F0]">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              World state
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5 font-medium">
              {active} active · {pending} pending · {disasters.length} blocked
            </p>
          </div>
        )}
        {/* The signed-in account. Signing out lives in the top bar's menu. */}
        <div
          className={`flex items-center gap-2.5 px-2 ${collapsed ? "justify-center" : ""}`}
        >
          <div
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-900 border border-slate-200 flex items-center justify-center font-bold text-[10px] shrink-0"
            title={user ? `${user.name} (${user.role})` : undefined}
          >
            {user
              ? user.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()
              : "OP"}
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-[11.5px] font-semibold text-slate-900 truncate">
                {user ? user.name : "Operator"}
              </span>
              <span className="text-[9.5px] text-slate-500 truncate capitalize">
                {user ? user.role : "Control room"}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-1.5 text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 rounded-lg transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
