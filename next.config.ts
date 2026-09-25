import type { NextConfig } from "next";

/** The brotli-packed Chromium that `@sparticuz/chromium` unpacks at runtime. */
const CHROMIUM_BINARY_FILES = [
  "./node_modules/@sparticuz/chromium/bin/**",
  "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
];

/** Every route that calls `renderDocumentSync` — see `lib/documents/service.ts`. */
const PDF_RENDERING_ROUTES = [
  "/api/documents/render",
  "/api/documents/render-jobs/process",
  "/api/documents/render-jobs/[id]",
  "/api/v2/crm/leads/[id]/documents/[docId]/pdf",
  "/api/v2/crm/deals/[id]/documents/[docId]/pdf",
  "/api/v2/schools/reports/export",
  "/api/accounting/sales/invoices/[id]/pdf",
  "/api/accounting/sales/quotations/[id]/pdf",
  "/api/accounting/sales/credit-notes/[id]/pdf",
  "/api/accounting/sales/receipts/[id]/pdf",
];

const nextConfig: NextConfig = {
  /**
   * Type errors are NOT ignored. `pnpm run typecheck` runs immediately before
   * `next build` in the build script and fails the deploy on the first error —
   * this only stops Next running a *second* check inside the build.
   *
   * It is here because that second check is what killed the production build.
   * The 8 GB builder finished compiling, started the check while the compile
   * still held its memory, and the container was SIGKILLed:
   *
   *     ✓ Compiled successfully in 2.5min
   *       Running TypeScript ...
   *     Error: Command "pnpm run build" exited with SIGKILL
   *
   * The check needs 2.6 GB on its own (measured) and the compile peaks near
   * 7 GB. Run in sequence they fit; run stacked they do not. Deleting this
   * line puts the check back inside the build and breaks the deploy again.
   */
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Phosphor is not in Next's built-in optimizePackageImports list. Its SSR
    // barrel re-exports 1,513 modules and lib/icons.tsx imports the barrel, so
    // every icon-using route (291 of them) otherwise compiles ~4.5k package
    // files. NOTE: dev cold-compile must be benchmarked when touching this —
    // hand-rolling deep imports instead measured 3x WORSE (67s -> 3.6min).
    optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/ssr"],
  },
  // Chromium is loaded at runtime by path, not by import, so the brotli-packed
  // binary has to reach every function that renders a PDF.
  //
  // Next's automatic tracing does in fact pick it up on its own — measured by
  // building this tree with and without these entries and diffing the emitted
  // `.nft.json` manifests; both carry `chromium.br`. These are belt and braces
  // for a file nothing statically imports, and they replace a list that named
  // only three of the nine routes that launch a browser. Keep it in step with
  // the callers of `renderDocumentSync`.
  //
  // `serverExternalPackages` is deliberately NOT set for these: Next already
  // ships `@sparticuz/chromium` and `puppeteer-core` in its default external
  // list (`next/dist/lib/server-external-packages.jsonc`), so restating them
  // here would be config that looks load-bearing and is not.
  outputFileTracingIncludes: Object.fromEntries(
    PDF_RENDERING_ROUTES.map((route) => [route, CHROMIUM_BINARY_FILES]),
  ),
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
