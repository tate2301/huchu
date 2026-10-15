import type { ReportSource } from "@/lib/reports/custom/sources";

import type { ExploreTable, LockedTable } from "./products";
import type { SavedQuestion } from "./questions";
import type { HistoryEntry } from "./runs";
import type { ExploreEngine, ExploreTemplate } from "./templates";

/** What `/api/explore/catalog` answers. */
export type ExploreCatalog =
  | { canUse: false; who: string; workspaceName: string }
  | {
      canUse: true;
      /**
       * Where a new question runs: over the real tables as `explore_reader`
       * ("tables"), or, until that login is set up, over the report sources
       * in the person's tab ("sources").
       */
      engine: ExploreEngine;
      workspaceName: string;
      /** The report sources the person reads: a question saved over them still runs in the tab. */
      sources: ReportSource[];
      /** The real tables the person's role reads, with their rows, when the engine is "tables". */
      tables: Array<ExploreTable & { rows?: number }> | null;
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

/** What `/api/explore/history` answers: the person's own questions, newest first. */
export type ExploreHistory = { ready: boolean; runs: HistoryEntry[] };
