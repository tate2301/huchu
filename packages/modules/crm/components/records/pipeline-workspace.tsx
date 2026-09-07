"use client";

import { useState } from "react";

import { LeadsWorkspace } from "../leads/leads-workspace";
import type { LeadViewFilters } from "../../views";

import { DealsContent } from "./deals-content";

/**
 * Leads and deals, on one page.
 *
 * They were two routes with two sidebars entries, and the complaint was fair:
 * a lead and the deal it becomes are the same piece of work at two moments,
 * and asking somebody to remember which page a thing is on today is asking
 * them to track our schema. The pipeline menu is the whole switch now — Leads
 * is the intake pipeline, the deal pipelines are the rest — and picking one
 * swaps what is under the toolbar without leaving the page.
 *
 * The two boards stay separate underneath because their stages are genuinely
 * different: a lead's are a fixed enum this module can reason about, a deal's
 * are configured per pipeline. Merging the models is a migration, and it is
 * not what makes the page confusing — having to navigate is.
 */
export function PipelineWorkspace({
  initial = "leads",
  initialFilters = {},
  initialView = "BOARD",
  initialViewId = null,
  openCreate = false,
}: {
  /** "leads", or a deal pipeline id — usually from the route. */
  initial?: "leads" | string;
  initialFilters?: LeadViewFilters;
  initialView?: "TABLE" | "BOARD";
  initialViewId?: string | null;
  openCreate?: boolean;
}) {
  const [active, setActive] = useState<"leads" | string>(initial);

  if (active === "leads") {
    return (
      <LeadsWorkspace
        initialFilters={initialFilters}
        initialView={initialView}
        initialViewId={initialViewId}
        onPickPipeline={setActive}
      />
    );
  }

  return (
    <DealsContent
      openCreate={openCreate}
      // `"deals"` means "whichever pipeline is the default" — the deals view
      // resolves that itself, so it is passed nothing rather than a sentinel
      // it would fail to find in the list.
      pipelineId={active === "deals" ? undefined : active}
      onPickPipeline={setActive}
    />
  );
}
