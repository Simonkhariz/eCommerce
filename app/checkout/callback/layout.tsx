import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment status | SHOP.CO',
  robots: { index: false, follow: false },
};

export default function PaymentStatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
