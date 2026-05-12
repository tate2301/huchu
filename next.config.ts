import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/documents/render": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/documents/render-jobs/process": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/documents/render-jobs/[id]": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.svg": {
        condition: {
          path: /@rtcamp\/frappe-ui-react\/dist\/icons\/down-solid\.svg$/,
        },
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  // Legacy Gold route redirects — single-line aliases for canonical paths
  // that used to live at the top level. Replaces seven stub page.tsx files
  // (every one was an identical `redirect()` indirection that confused
  // search and onboarding). 308 = permanent; bookmarks still resolve.
  async redirects() {
    return [
      { source: "/gold/pour", destination: "/gold/intake/pours", permanent: true },
      { source: "/gold/pour/new", destination: "/gold/intake/pours/new", permanent: true },
      { source: "/gold/dispatch", destination: "/gold/transit/dispatches", permanent: true },
      { source: "/gold/dispatch/new", destination: "/gold/transit/dispatches/new", permanent: true },
      { source: "/gold/receipt", destination: "/gold/settlement/receipts", permanent: true },
      { source: "/gold/receipt/new", destination: "/gold/settlement/receipts/new", permanent: true },
      { source: "/gold/payouts", destination: "/gold/settlement/payouts", permanent: true },
    ];
  },
};

export default nextConfig;
