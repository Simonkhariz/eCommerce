import type { Metadata } from 'next';
import { AdminSystemStatus } from '@/components/admin/AdminSystemStatus';

export const metadata: Metadata = { title: 'System status · Store Admin' };

export default function Page() {
  return <AdminSystemStatus />;
}
