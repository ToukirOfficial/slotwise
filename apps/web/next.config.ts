import type { NextConfig } from 'next';

// The dashboard calls the API on its own origin: /api/* is proxied to NestJS (same on the server via nginx).
const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:8115';

const nextConfig: NextConfig = {
  transpilePackages: ['@slotwise/shared'],
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // The widget is loaded by customers' sites; cache it for an hour.
      { source: '/widget/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }] },
      // Keep the manage token out of Referer headers sent to other sites.
      { source: '/manage/:token*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      // The dashboard is never framed; /b/{slug} may be (it's a booking page).
      { source: '/((?!b/).*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
    ];
  },
};

export default nextConfig;
