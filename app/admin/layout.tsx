import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'E-Commerce Admin Dashboard',
  description: 'Enterprise operations, SLA monitoring, customer support tickets, and analytics dashboard.',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[#f8f8f8] text-[#1f2937] font-sans antialiased selection:bg-[#1f2937] selection:text-white">
      {children}
    </div>
  );
}
