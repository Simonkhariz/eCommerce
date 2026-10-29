import { queryOptions } from '@tanstack/react-query';
import { adminGetOrders, adminGetStorageAlert } from '@/lib/admin-api';

/**
 * TanStack Query keys and options for admin data (see lib/query-client.ts for the defaults).
 * Every key starts with ['admin', adminId], so one admin's cached data is never shown to
 * another, even if a session ends without signing out (sign-out also clears the cache).
 */
export const adminKeys = {
  all: (adminId: number) => ['admin', adminId] as const,
  bell: (adminId: number) => ['admin', adminId, 'bell'] as const,
  storageAlert: (adminId: number) => ['admin', adminId, 'storage-alert'] as const,
};

export interface BellCounts {
  /** WhatsApp transfers customers marked as paid, waiting for the admin to confirm. */
  claimed: number;
  /** Orders flagged for attention (late, duplicate or mismatched payments). */
  attention: number;
}

/**
 * Bell counts. Shared by the whole admin and kept for 30 s, so moving between screens no
 * longer asks again each time. Polled every minute while the tab is visible (not in the
 * background), and refreshed when the admin comes back to the tab if older than 30 s.
 */
export const bellCountsQuery = (adminId: number) =>
  queryOptions({
    queryKey: adminKeys.bell(adminId),
    queryFn: async ({ signal }): Promise<BellCounts> => {
      const [claimed, attention] = await Promise.all([
        adminGetOrders({ status: 'payment_claimed', per_page: 1 }, signal),
        adminGetOrders({ status: 'attention', per_page: 1 }, signal),
      ]);
      return { claimed: claimed.pagination.total, attention: attention.pagination.total };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

/**
 * The first database problem (size, speed, overdue clean-up), or null when all is fine. It
 * changes slowly and the API caches it for 5 minutes, so it is checked every 5 minutes.
 */
export const storageAlertQuery = (adminId: number) =>
  queryOptions({
    queryKey: adminKeys.storageAlert(adminId),
    queryFn: async ({ signal }): Promise<string | null> => {
      const r = await adminGetStorageAlert(signal);
      return r.level === 'ok' ? null : (r.issues[0]?.title ?? 'Database needs attention');
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
