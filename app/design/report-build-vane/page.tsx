"use client";

import * as React from "react";

import { ReportBuilderView } from "@/components/reports/custom/report-builder-view";
import type { SuggestionState } from "@/components/reports/custom/vane-suggestion";
import type { CustomReportInput } from "@/lib/reports/custom/document";

import { FixtureRail } from "../_fixtures/shell";
import { FIXTURE_REPORT, FIXTURE_RESULTS, FIXTURE_SUGGESTION, FIXTURE_SUGGESTION_BLOCK, FIXTURE_TABLES } from "../_fixtures/report-build";

/**
 * ReportBuildVane: the Monday board in its builder with Vane's suggestion
 * waiting to be kept. The real builder shows it only when Vane has written one
 * for the report; its engine is not built yet, so this is where it is checked.
 * Keep and Not now work here on the page's own copy.
 */
export default function ReportBuildVaneFixture() {
  const [draft, setDraft] = React.useState<CustomReportInput>(FIXTURE_REPORT);
  const [state, setState] = React.useState<SuggestionState>("waiting");
  return (
    <div style={{ display: "flex", height: "100dvh" }}>
      <FixtureRail module="Reports" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <ReportBuilderView
          report={{ id: "fixture", canShare: true }}
          draft={draft}
          onDraft={setDraft}
          sources={[]}
          data={{
            tables: FIXTURE_TABLES,
            checks: new Map(),
            results: FIXTURE_RESULTS,
            truncated: new Set(),
            pending: false,
            running: false,
            ms: 40,
            rerun: () => undefined,
          }}
          params={{ from: "2026-07-15", to: "2026-10-13" }}
          saved={draft === FIXTURE_REPORT ? { state: "saved", at: "11:48" } : { state: "dirty" }}
          problems={[]}
          onPublish={() => setDraft(FIXTURE_REPORT)}
          onBack={() => undefined}
          suggestion={
            state === "dismissed"
              ? null
              : { item: FIXTURE_SUGGESTION, block: FIXTURE_SUGGESTION_BLOCK, state, onKept: () => setState("kept"), onDismiss: () => setState("dismissed") }
          }
        />
      </div>
    </div>
  );
}
