import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Landing from './components/Landing';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';

import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import ProtectedRoute from './components/auth/ProtectedRoute';

import DashboardView from './components/views/DashboardView';
import OperationsView from './components/views/OperationsView';
import GreenCorridorView from './components/views/GreenCorridorView';
import MissionsView from './components/views/MissionsView';
import FleetView from './components/views/FleetView';
import DisastersView from './components/views/DisastersView';
import AnalyticsView from './components/views/AnalyticsView';
import LogsView from './components/views/LogsView';
import SettingsView from './components/views/SettingsView';

import NewMissionDialog from './components/panels/NewMissionDialog';
import DisasterDialog from './components/panels/DisasterDialog';

import useAuthStore from './store/useAuthStore';
import { applySimSource, teardownSimSource } from './lib/simSource';
import { useCitizenReportsSync } from './hooks/useCitizenReportsSync';

/**
 * Application shell.
 *
 *   Dashboard        service health and recorded history from the web backend
 *   Operations       map, missions, units, disasters, live A*, congestion
 *   Green Corridor   frozen path, traffic lights, preemption, conflicts
 *   Missions         dispatch queue, active missions, history, route detail
 *   Fleet            units and facilities
 *   Disasters        active blockages
 *   Shared           analytics, structured logs, settings, demo world, reset
 *
 * Everything below `/` is behind a sign-in. The landing page stays public so
 * there is still a front door.
 */
function Shell({ children }) {
  // Poll and synchronize citizen reports from the mobile app
  useCitizenReportsSync();

  // The world is only driven while the console is actually on screen. Mounting
  // here (rather than at the app root) means the login page does not hold a
  // WebSocket open or run a simulation loop.
  useEffect(() => {
    applySimSource();
    return () => teardownSimSource();
  }, []);

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden select-none">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar />
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">{children}</div>
      </div>
      <NewMissionDialog />
      <DisasterDialog />
    </div>
  );
}

/** Every console route shares the shell, so it is wrapped once here. */
function Console() {
  return (
    <Shell>
      <Routes>
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/operations" element={<OperationsView />} />
        <Route path="/corridor" element={<GreenCorridorView />} />
        <Route path="/missions" element={<MissionsView />} />
        <Route path="/fleet" element={<FleetView />} />
        <Route path="/disasters" element={<DisastersView />} />
        <Route path="/analytics" element={<AnalyticsView />} />
        <Route path="/logs" element={<LogsView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  const location = useLocation();
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Checks a stored token once, before any protected route is decided.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (location.pathname === '/') return <Landing />;
  if (location.pathname === '/login') return <LoginPage />;
  if (location.pathname === '/register') return <RegisterPage />;

  return (
    <ProtectedRoute>
      <Console />
    </ProtectedRoute>
  );
}
