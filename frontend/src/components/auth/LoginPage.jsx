import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import AuthLayout from './AuthLayout';
import { Button, Field, Input } from '../common/ui';
import useAuthStore from '../../store/useAuthStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const status = useAuthStore((s) => s.status);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  // Where the guard sent us from, so signing in resumes what you were doing.
  const destination = location.state?.from || '/dashboard';

  if (status === 'authed') return <Navigate to={destination} replace />;

  const submit = async (event) => {
    event.preventDefault();
    clearError();
    try {
      const user = await login({ email: email.trim(), password });
      toast.success(`Signed in as ${user.name}`);
      navigate(destination, { replace: true });
    } catch {
      /* the message is already in the store and rendered below */
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Operations console access. Your role decides what you can change."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-[#111827] hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@packmen.local"
            autoComplete="username"
            required
            autoFocus
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-700 leading-relaxed">{error}</p>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          <LogIn className="w-4 h-4" />
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
