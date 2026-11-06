import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My orders | SHOP.CO',
  robots: { index: false, follow: false },
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
