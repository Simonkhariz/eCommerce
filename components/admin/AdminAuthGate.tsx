'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiUser, apiGetMe, apiGetSetupStatus, apiLogout } from '@/lib/api-client';
import { LoadingState } from '@/components/admin/ui';

interface AdminSession {
  admin: ApiUser;
  signOut: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error('useAdminSession must be used inside <AdminAuthGate>');
  return ctx;
}

export function isAdminRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** Only same-app admin paths are accepted as a post-login destination. */
export function safeAdminNext(next: string | null | undefined): string {
  return next && next.startsWith('/admin') && !next.startsWith('//') && !next.startsWith('/admin/login') && !next.startsWith('/admin/setup')
    ? next
    : '/admin';
}

/**
 * Guards the admin panel behind a real admin session (HTTP-only `shopco_admin` cookie).
 * Signed-out visitors go to /admin/login (or /admin/setup on a brand-new store).
 * The API enforces the same rule server-side on every request.
 */
export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<ApiUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiGetMe('admin');
        if (cancelled) return;
        if (!isAdminRole(me.user.role)) throw new Error('not admin');
        setAdmin(me.user);
      } catch {
        if (cancelled) return;
        let needsSetup = false;
        try {
          needsSetup = !(await apiGetSetupStatus()).is_setup_completed;
        } catch {
          // If the status check fails, the login page explains the problem.
        }
        const search = typeof window !== 'undefined' ? window.location.search : '';
        router.replace(needsSetup ? '/admin/setup' : `/admin/login?next=${encodeURIComponent(pathname + search)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only on first load: later 401s are handled by redirectIfSignedOut().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout('admin');
    } finally {
      setAdmin(null);
      router.replace('/admin/login');
    }
  }, [router]);

  if (!admin) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f8f8f8]">
        <LoadingState label="Checking your admin session…" />
      </main>
    );
  }

  return <AdminSessionContext.Provider value={{ admin, signOut }}>{children}</AdminSessionContext.Provider>;
}
