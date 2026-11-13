import type { ReportLoader } from "@/lib/reports/types";

/** The fixture's report loaders, registered in place of `extensions/server.ts` by the contract test. */
export const FIXTURE_LOADERS: Record<string, ReportLoader> = {
  "fixture-runs": { load: async () => ({ rows: [{ id: "R-1", run: "R-1" }], truncated: false }) },
};
