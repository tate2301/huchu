import { fetchJson } from "@/lib/api-client";
import type { BuildCounts, BuildItem } from "@/lib/build/items";
import type { BuildProvisions } from "@/lib/build/provision";
import type { TemplatesView } from "@/lib/build/templates";

/** What `GET /api/build` answers: Build's list, its templates and its panel's figures. */
export type BuildHomeData = {
  items: BuildItem[];
  counts: BuildCounts;
  finding: { fact: string; rest: string | null };
  templates: TemplatesView;
  provisions: BuildProvisions;
  badges: Record<string, string>;
  canStart: boolean;
};

/** The query Build's pages and its panel share: one answer for both. */
export const BUILD_HOME_KEY = ["build", "home"] as const;

export function fetchBuildHome() {
  return fetchJson<BuildHomeData>("/api/build");
}
