'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, LogIn } from 'lucide-react';
import { ApiUser, apiGetMe, apiGetSetupStatus, apiLogin, apiLogout } from '@/lib/api-client';

interface AdminSession {
  admin: ApiUser;
  signOut: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession | null {
  return useContext(AdminSessionContext);
}

type GateState = 'checking' | 'signed-out' | 'needs-setup' | 'signed-in';

/**
 * Guards every admin screen behind a real admin session (HTTP-only `shopco_admin` cookie).
 * The API enforces the same rule server-side; this gate just shows a sign-in screen
 * instead of a dashboard full of 401 errors.
 */
export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const [admin, setAdmin] = useState<ApiUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const me = await apiGetMe('admin');
      setAdmin(me.user);
      setState('signed-in');
    } catch {
      setAdmin(null);
      try {
        const setup = await apiGetSetupStatus();
        setState(setup.is_setup_completed ? 'signed-out' : 'needs-setup');
      } catch {
        setState('signed-out');
      }
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const signOut = useCallback(async () => {
    try {
      await apiLogout('admin');
    } finally {
      setAdmin(null);
      setState('signed-out');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiLogin({ email, password });
      if (res.user.role !== 'admin' && res.user.role !== 'super_admin') {
        await apiLogout('customer');
        setError('This account does not have administrator access.');
        return;
      }
      setPassword('');
      setAdmin(res.user);
      setState('signed-in');
    } catch (err: any) {
      setError(err?.message || 'Sign in failed. Please check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'signed-in' && admin) {
    return (
      <AdminSessionContext.Provider value={{ admin, signOut }}>
        {children}
      </AdminSessionContext.Provider>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f8f8f8] px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
        {state === 'checking' ? (
          <div className="flex flex-col items-center gap-3 py-6" role="status" aria-live="polite">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-black/10 border-t-black" />
            <p className="text-sm text-[#6b7280]">Checking your admin session…</p>
          </div>
        ) : state === 'needs-setup' ? (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-bold text-[#111827]">Store setup required</h1>
            <p className="text-sm text-[#4b5563]">
              No administrator account exists yet. Complete the one-time store setup to create it.
            </p>
            <p className="rounded-lg bg-[#f3f4f6] p-3 text-left font-mono text-xs text-[#374151]">
              php backend/migrations/setup_admin.php --name=&quot;Your Name&quot; --email=&quot;you@example.com&quot; --password=&quot;…&quot;
            </p>
            <button
              type="button"
              onClick={checkSession}
              className="w-full rounded-xl bg-black py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              I&apos;ve completed setup
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f3f4f6] text-[#111827]">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <h1 className="text-xl font-bold text-[#111827]">Admin sign in</h1>
              <p className="text-sm text-[#6b7280]">Sign in with your store administrator account.</p>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div>
              <label htmlFor="admin-email" className="mb-1 block text-xs font-semibold text-[#374151]">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[#d1d5db] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="mb-1 block text-xs font-semibold text-[#374151]">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#d1d5db] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-center text-xs text-[#6b7280]">
              <Link href="/" className="hover:text-black hover:underline">
                Back to the store
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
