import type { Metadata } from 'next';
import { AdminOrderDetail } from '@/components/admin/AdminOrderDetail';

export function generateMetadata({ params }: { params: { number: string } }): Metadata {
  return { title: `${decodeURIComponent(params.number)} · Store Admin` };
}

export default function Page({ params }: { params: { number: string } }) {
  return <AdminOrderDetail orderNumber={decodeURIComponent(params.number)} />;
}
