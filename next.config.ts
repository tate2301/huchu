import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

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
   * Type errors are NOT ignored: `pnpm typecheck` runs on every push and pull
   * request in `.github/workflows/checks.yml`, and a red check blocks the
   * merge. This only stops Next running its own check inside the build.
   *
   * The check does not belong in the build. It needs five minutes and 4.5 GB
   * on its own (the generated Prisma client is a 101 MB `index.d.ts`), the
   * compile peaks near 7 GB, and the Vercel machine has 8 GB and a 45-minute
   * limit: run inside the build the two stacked and the container was
   * SIGKILLed; run in sequence they fit but the deploy ran past the limit.
   * Deleting this line puts the check back inside the build.
   */
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // No server source maps. Measured on the same tree (4 cores, 15 GB):
    // compile 3.2 min -> 2.6 min, peak build memory 7.1 GB -> 6.2 GB, and
    // `.next` 428 MB -> 199 MB, so Vercel also traces and uploads half as
    // much. Memory is what matters: the Vercel machine has 8 GB and the
    // compile was sitting at its ceiling. The cost is that a server stack
    // trace in the function logs names a chunk and line, not the source file;
    // delete this line to get the source file back at that price.
    turbopackSourceMaps: false,
    // Phosphor is not in Next's built-in optimizePackageImports list. Its SSR
    // barrel re-exports 1,513 modules; with this, lib/icons.tsx's named
    // imports resolve straight to the 225 icon files the product draws
    // instead of through the barrel. NOTE: dev cold-compile must be
    // benchmarked when touching this — hand-rolling deep imports instead
    // measured 3x WORSE (67s -> 3.6min).
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

      // Pages moved to the one address each has in the sidebar (`lib/nav/registry.ts`).
      // The old address forwards for good, with whatever followed it, so a
      // bookmark, an e-mailed link or a record link in a timeline still lands.
      { source: "/retail/end-of-day/:path*", destination: "/retail/shifts/end-of-day/:path*", permanent: true },
      { source: "/crm/work-orders/:path*", destination: "/crm/projects/jobs/:path*", permanent: true },
      { source: "/crm/follow-ups/:path*", destination: "/crm/tasks/follow-ups/:path*", permanent: true },
      { source: "/schools/admissions/:path*", destination: "/schools/students/applications/:path*", permanent: true },
      { source: "/schools/guardians/:path*", destination: "/schools/students/guardians/:path*", permanent: true },
      { source: "/schools/leavers/:path*", destination: "/schools/students/leavers/:path*", permanent: true },
      { source: "/schools/calendar/:path*", destination: "/schools/attendance/calendar/:path*", permanent: true },
      { source: "/schools/timetable/:path*", destination: "/schools/attendance/timetable/:path*", permanent: true },
      { source: "/schools/exams/:path*", destination: "/schools/results/exams/:path*", permanent: true },
      { source: "/schools/teachers/:path*", destination: "/schools/staff/teachers/:path*", permanent: true },
      { source: "/schools/messages/:path*", destination: "/schools/families/messages/:path*", permanent: true },
      { source: "/schools/notices/:path*", destination: "/schools/families/notices/:path*", permanent: true },
      { source: "/schools/meetings/:path*", destination: "/schools/families/meetings/:path*", permanent: true },

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

// Keeps esbuild, which builds the service worker in `app/serwist`, out of the
// server bundle.
export default withSerwist(nextConfig);
