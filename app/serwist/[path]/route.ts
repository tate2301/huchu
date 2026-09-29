import { spawnSync } from "node:child_process";

import { createSerwistRoute } from "@serwist/turbopack";

import { OFFLINE_FALLBACK_URL } from "@/lib/offline/service-worker-protocol";

/**
 * Builds and serves the service worker (`app/sw.ts`) at `/serwist/sw.js`.
 *
 * `@serwist/turbopack` bundles the worker with esbuild and injects the build's
 * static-file manifest, so the precache is exactly the chunks this deploy
 * produced. The fallback page is not a static file, so it rides along as an
 * extra entry whose revision changes with every commit.
 */
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "app/sw.ts",
    useNativeEsbuild: true,
    additionalPrecacheEntries: [{ url: OFFLINE_FALLBACK_URL, revision }],
    // Two of the app's shared chunks are over Serwist's 2 MB default (4.8 MB
    // and 2.3 MB at the time of writing). Left out, every page that loads
    // them would fail offline while the panel reported the bundle complete.
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  });
