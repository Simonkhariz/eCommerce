import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Toast } from '@/components/ui/Toast';
import { WishlistDrawer } from '@/components/layout/WishlistDrawer';

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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Host+Grotesk:ital,wght@0,300..800;1,300..800&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-white text-black antialiased selection:bg-black selection:text-white">
        <CartProvider>
          <WishlistProvider>
            <Header />
            <main className="flex-grow">{children}</main>
            <Footer />
            <Toast />
            <WishlistDrawer />
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}
