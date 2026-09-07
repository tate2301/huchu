import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// The Sell host is one workspace package. The repository root is where the lockfile,
// the pnpm store and the other packages live, so file tracing and Turbopack are
// rooted there; and one `.env` at the root serves every package — Next has
// already loaded this app's own `.env`, so only what it did not set is filled in.
const workspaceRoot = path.resolve(__dirname, "../..");
loadEnv({ path: path.join(workspaceRoot, ".env"), quiet: true });

// The generated Prisma client lives in the workspace root's node_modules (see
// packages/db/README.md). The chromium binary the PDF renderer needs sits in the
// pnpm store at the root as well; both spellings are listed so the trace finds
// it whether the package is linked into this app or resolved from the root.
const chromiumBinaries = [
  "./node_modules/@sparticuz/chromium/bin/**",
  "../../node_modules/@sparticuz/chromium/bin/**",
  "../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  // Workspace packages ship TypeScript source; Next compiles them like app code.
  transpilePackages: ["@corelithzw/db", "@corelithzw/ui", "@corelithzw/platform", "@corelithzw/shell", "@corelithzw/module-workflow", "@corelithzw/module-notifications", "@corelithzw/module-offline", "@corelithzw/module-records", "@corelithzw/module-documents", "@corelithzw/module-books", "@corelithzw/module-people", "@corelithzw/module-stock", "@corelithzw/module-maintenance", "@corelithzw/module-compliance", "@corelithzw/module-sell"],
  experimental: {
    // Phosphor is not in Next's built-in optimizePackageImports list. Its SSR
    // barrel re-exports 1,513 modules and lib/icons.tsx imports the barrel, so
    // every icon-using route (291 of them) otherwise compiles ~4.5k package
    // files. NOTE: dev cold-compile must be benchmarked when touching this —
    // hand-rolling deep imports instead measured 3x WORSE (67s -> 3.6min).
    optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/ssr"],
  },
  outputFileTracingIncludes: {
    "/api/documents/render": chromiumBinaries,
    "/api/documents/render-jobs/process": chromiumBinaries,
    "/api/documents/render-jobs/[id]": chromiumBinaries,
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
    root: workspaceRoot,
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
};

export default nextConfig;
