import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { StoreShell } from '@/components/layout/StoreShell';
import { Toast } from '@/components/ui/Toast';
import { WishlistDrawer } from '@/components/layout/WishlistDrawer';
import { AuthModal } from '@/components/auth/AuthModal';

export const metadata: Metadata = {
  title: 'SHOP.CO | Find Clothes That Match Your Style',
  description:
    'Browse through our diverse range of meticulously crafted garments, designed to bring out your individuality and cater to your sense of style.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Geist:wght@100..900&family=Host+Grotesk:ital,wght@0,300..800;1,300..800&family=Inter:wght@300;400;500;600;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,900&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-white text-black antialiased selection:bg-black selection:text-white">
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <StoreShell>{children}</StoreShell>
              <AuthModal />
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
