import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phosphor is not in Next's built-in optimizePackageImports list. Its SSR
    // barrel re-exports 1,513 modules and lib/icons.tsx imports the barrel, so
    // every icon-using route (291 of them) otherwise compiles ~4.5k package
    // files. NOTE: dev cold-compile must be benchmarked when touching this —
    // hand-rolling deep imports instead measured 3x WORSE (67s -> 3.6min).
    optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/ssr"],
  },
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
      // The marketing home moved to the site root. Redirecting here rather than
      // from a page component gives a real 308 at the routing layer — a page-level
      // redirect() emits a meta-refresh after a full HTML render, which costs a
      // wasted download and is treated as a soft redirect by search engines.
      // Only the exact path matches, so /home/pricing and friends are untouched.
      { source: "/home", destination: "/", permanent: true },

      // Marketing IA moved: the site is now organised by the kind of business a
      // visitor runs, and schools carry their pricing on their own page. These
      // live here, not in page components, for the same 308-vs-meta-refresh
      // reason as the rule above.
      { source: "/home/product", destination: "/home/products", permanent: true },
      { source: "/home/products/retail-wholesale", destination: "/home/solutions/sellers", permanent: true },
      { source: "/home/products/automotive", destination: "/home/solutions/workshops", permanent: true },
      { source: "/home/products/schools", destination: "/home/schools", permanent: true },
      { source: "/home/solutions/commerce", destination: "/home/solutions/sellers", permanent: true },
      { source: "/home/solutions/retail-wholesale", destination: "/home/solutions/sellers", permanent: true },
      { source: "/home/solutions/workshops-auto", destination: "/home/solutions/workshops", permanent: true },
      { source: "/home/solutions/automotive", destination: "/home/solutions/workshops", permanent: true },
      { source: "/home/solutions/schools", destination: "/home/schools", permanent: true },
      { source: "/home/pricing/schools", destination: "/home/schools", permanent: true },

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
