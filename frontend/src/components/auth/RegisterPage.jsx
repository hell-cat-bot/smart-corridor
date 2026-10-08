import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

import AuthLayout from './AuthLayout';
import { Button, Field, Input } from '../common/ui';
import useAuthStore from '../../store/useAuthStore';

export default function RegisterPage() {
  const navigate = useNavigate();

  const status = useAuthStore((s) => s.status);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const register = useAuthStore((s) => s.register);
  const clearError = useAuthStore((s) => s.clearError);

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');

  if (status === 'authed') return <Navigate to="/dashboard" replace />;

  // Checked here as well as on the backend, so the message appears as you type
  // rather than after a round trip.
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  const submit = async (event) => {
    event.preventDefault();
    if (mismatch || tooShort) return;
    clearError();
    try {
      const user = await register({ name: name.trim(), email: email.trim(), password });
      toast.success(
        user.role === 'admin'
          ? 'Account created — you are the first user, so you are the administrator.'
          : `Account created. You have ${user.role} access until an administrator changes it.`,
      );
      navigate('/dashboard', { replace: true });
    } catch {
      /* the message is already in the store and rendered below */
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      subtitle="The first account on a fresh database becomes the administrator. Everyone after that starts read-only."
      footer={
        <>
          Already have one?{' '}
          <Link to="/login" className="font-semibold text-[#111827] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required autoFocus />
        </Field>

        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@packmen.local"
            autoComplete="username"
            required
          />
        </Field>

        <Field label="Password" hint="At least 8 characters.">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Field label="Confirm password">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        {(mismatch || tooShort) && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
            <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              {tooShort ? 'Password must be at least 8 characters.' : 'The two passwords do not match.'}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-700 leading-relaxed">{error}</p>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={busy || mismatch || tooShort}>
          <UserPlus className="w-4 h-4" />
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
