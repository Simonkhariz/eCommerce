import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Track your order | SHOP.CO',
};

export default function TrackOrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
