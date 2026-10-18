import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';
import { StoreShell } from '@/components/layout/StoreShell';
import { StoreDataProvider, type StoreSeed } from '@/components/layout/StoreDataProvider';
import { AuthModal } from '@/components/auth/AuthModal';
import { serverApiGet } from '@/lib/server-api';

// Fonts are served with the site (no requests to outside font services, nothing blocks the
// first paint); the fallback font is sized to match, so text does not jump when they arrive.
// Satoshi: ITF Free Font License (fontshare.com). Space Grotesk: SIL Open Font License.
const satoshi = localFont({
  src: [
    { path: './fonts/satoshi-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/satoshi-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/satoshi-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/satoshi-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-satoshi',
  display: 'swap',
  // Four weights (~100 KB): preloading them all slowed the first paint on mobile data, so the
  // browser fetches the ones a page uses as soon as the stylesheet asks for them.
  preload: false,
});

const spaceGrotesk = localFont({
  src: './fonts/space-grotesk-latin.woff2',
  weight: '300 700',
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SHOP.CO | Find Clothes That Match Your Style',
  description:
    'Browse through our diverse range of meticulously crafted garments, designed to bring out your individuality and cater to your sense of style.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Header categories, footer contact details and checkout options come with every page
  // (fetched here at most once a minute) instead of three requests from each visitor's browser.
  const [facets, shipping, payments] = await Promise.all([
    serverApiGet<StoreSeed['facets']>('/catalog/facets'),
    serverApiGet<StoreSeed['shipping']>('/checkout/shipping-zones'),
    serverApiGet<StoreSeed['payments']>('/checkout/payment-methods'),
  ]);

  return (
    <html lang="en" className={`${satoshi.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen flex flex-col bg-white text-black antialiased selection:bg-black selection:text-white">
        <StoreDataProvider seed={{ facets, shipping, payments }}>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
                <StoreShell>{children}</StoreShell>
                <AuthModal />
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </StoreDataProvider>
      </body>
    </html>
  );
}
