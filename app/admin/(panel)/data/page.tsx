import type { Metadata } from 'next';
import { AdminDataStorage } from '@/components/admin/AdminDataStorage';

export const metadata: Metadata = { title: 'Data & storage · Store Admin' };

export default function Page() {
  return <AdminDataStorage />;
}
