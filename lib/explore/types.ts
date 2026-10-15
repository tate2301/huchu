import type { ReportSource } from "@/lib/reports/custom/sources";

import type { LockedTable } from "./products";
import type { SavedQuestion } from "./questions";
import type { ExploreTemplate } from "./templates";

/** What `/api/explore/catalog` answers. */
export type ExploreCatalog =
  | { canUse: false; who: string; workspaceName: string }
  | {
      canUse: true;
      workspaceName: string;
      sources: ReportSource[];
      locked: LockedTable[];
      templates: Array<ExploreTemplate & { reads: string[] }>;
      saved: SavedQuestion[];
    };

/** What `/api/explore/schedules?question=` answers. */
export type ExploreScheduleInfo = {
  ready: boolean;
  waiting: string | null;
  people: Array<{ id: string; name: string }>;
};
