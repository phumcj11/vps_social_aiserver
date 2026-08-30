// @ts-check

/**
 * Next.js configuration for the KMKT Social AI web app.
 * Minimal by design for the bootstrap sprint. Telemetry is disabled to avoid
 * any outbound network calls during build.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  // M10B — retire the legacy English business UI from the customer surface.
  // Server-level redirect (defense-in-depth alongside the page-level redirects);
  // kept in sync with apps/web/lib/legacy-redirects.ts (verified by test).
  async redirects() {
    return [
      { source: '/businesses', destination: '/settings/businesses', permanent: false },
      { source: '/businesses/:id', destination: '/settings/businesses/:id', permanent: false },
    ];
  },
};

export default nextConfig;
