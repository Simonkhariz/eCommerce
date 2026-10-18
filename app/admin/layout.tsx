import type { Metadata } from 'next';
import { AdminUiProvider } from '@/components/admin/ui';

export const metadata: Metadata = {
  title: 'Store Admin',
  description: 'Shop.co store administration: orders, catalogue, inventory, payments and fulfilment.',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#f8f8f8] font-sans text-[#1f2937] antialiased selection:bg-[#1f2937] selection:text-white">
      <AdminUiProvider>{children}</AdminUiProvider>
    </div>
  );
}
