import type { ReportLoader } from "@/lib/reports/types";

/**
 * Server-only parts of this deployment's extensions: the report loaders,
 * which query the database. Empty in core.
 *
 * `extensions/index.ts` is imported on the proxy's path and must stay plain
 * data, so anything that reads the database is registered here instead. An
 * industry fork adds one line per extension, e.g.
 *
 *   import { MILLING_LOADERS } from "./milling/loaders";
 *   export const registeredExtensionLoaders = { ...MILLING_LOADERS };
 *
 * Every key must be a report its extension declares (`reports`); the report
 * registry test fails on a report without a loader or a loader without one.
 */
export const registeredExtensionLoaders: Readonly<Record<string, ReportLoader>> = {};
