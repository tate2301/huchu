"use client";

import { Button, KitScreen } from "@/components/core";
import { ForYouView } from "@/components/vane/for-you-view";

import { FixtureShell } from "../_fixtures/shell";
import { FIXTURE_FOR_YOU } from "../_fixtures/vane";

/** For you (design/core-modules/html/vane.html), with the drawn Floorcode data. */
export default function VaneFixture() {
  return (
    <KitScreen slug="vane">
      <FixtureShell
        module="Vane"
        panelTitle="Vane"
        rows={[
          { label: "For you", icon: "foryou", count: 5, on: true },
          { label: "Working on", icon: "working", count: 2 },
          { label: "Plans", icon: "list", count: 1 },
          { label: "Done", icon: "done", meta: "12 today" },
          { label: "Muted", icon: "muted" },
        ]}
        groups={[
          {
            title: "Watching",
            rows: [
              { label: "Books", icon: "books" },
              { label: "Pipeline", icon: "pipeline" },
              { label: "Site visits", icon: "visits" },
              { label: "Showroom", icon: "showroom" },
              { label: "Reports", icon: "reports" },
            ],
          },
        ]}
        title="For you"
        titleIcon="foryou"
        actions={<Button icon="pause">Pause Vane</Button>}
      >
        <ForYouView panel={FIXTURE_FOR_YOU} canResume onResume={() => {}} onAct={() => {}} onNotNow={() => {}} />
      </FixtureShell>
    </KitScreen>
  );
}
