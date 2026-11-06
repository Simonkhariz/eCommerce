import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Signing you in | SHOP.CO',
  robots: { index: false, follow: false },
};

export default function VerifySignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
