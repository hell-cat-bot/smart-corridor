import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';

/** Shown while the stored token is being checked, so nothing flashes. */
function CheckingSession() {
  return (
    <div className="h-screen w-screen bg-[#F7F7FB] flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-[#111827]/25 border-t-[#111827] animate-spin" />
      <p className="text-[11px] text-gray-400 font-medium">Restoring your session…</p>
    </div>
  );
}

/**
 * Wraps every console route.
 *
 * Where you were trying to go is remembered in the navigation state, so signing
 * in returns you there instead of dumping you on the default page.
 */
export default function ProtectedRoute({ children, role }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const hasRole = useAuthStore((s) => s.hasRole);
  const location = useLocation();

  if (status === 'loading') return <CheckingSession />;

  if (status !== 'authed') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (role && !hasRole(role)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <p className="text-sm font-semibold text-gray-700">This page needs the {role} role</p>
        <p className="text-[11.5px] text-gray-500 mt-1">
          You are signed in as {user?.name} ({user?.role}).
        </p>
      </div>
    );
  }

  return children;
}
