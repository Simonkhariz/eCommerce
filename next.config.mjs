/** @type {import('next').NextConfig} */

// Server-only: where the PHP API runs. The browser never talks to it directly; it calls
// same-origin /api/v1/* and /uploads/*, which Next.js proxies here. Same origin means the
// API's HTTP-only SameSite session cookies just work and no token is exposed to JavaScript.
const BACKEND_ORIGIN = (process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8000').replace(/\/$/, '');

// Links from the old single-page admin (/admin?tab=orders) go to the real routes.
const LEGACY_ADMIN_TABS = {
  orders: 'orders', shipping: 'shipping', products: 'products', categories: 'categories',
  inventory: 'inventory', customers: 'customers', payments: 'payments', refunds: 'refunds',
  promotions: 'promotions', marketing: 'marketing', storefront: 'storefront', analytics: 'analytics',
  notifications: 'notifications', 'audit-logs': 'audit-logs', settings: 'settings',
  'system-status': 'system', account: 'account',
};

const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return Object.entries(LEGACY_ADMIN_TABS).map(([tab, route]) => ({
      source: '/admin',
      has: [{ type: 'query', key: 'tab', value: tab }],
      destination: `/admin/${route}`,
      permanent: false,
    }));
  },
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${BACKEND_ORIGIN}/api/v1/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND_ORIGIN}/uploads/:path*` },
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.dummyjson.com',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
