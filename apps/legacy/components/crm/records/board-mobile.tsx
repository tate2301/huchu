"use client";

import { useState, type ReactNode } from "react";

import { EmptyState } from "@corelithzw/react";

import { RecordList, type RecordListRow } from "@corelithzw/module-records/components/record-list";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * A kanban board, on a phone.
 *
 * A board is a horizontal instrument. It works because you can see four
 * columns at once and compare them; at 390px you can see one, and swiping
 * between them means losing your place in a strip with no landmarks. So a
 * phone gets the thing the board is actually for — which records are in which
 * stage — as a stage picker and a single list.
 *
 * Dragging stays on the desktop board. Nothing becomes unreachable: tapping a
 * row opens the record, where the stage control already lives.
 */

export type MobileBoardStage = {
  id: string;
  label: string;
  count: number;
  /** The column's colour on the board, so the chips read as the same stages. */
  dot?: string;
  /** A one-line summary under the picker — a stage total, usually. */
  meta?: ReactNode;
  rows: RecordListRow[];
};

export function MobileBoard({
  stages,
  noun = { one: "record", many: "records" },
  emptyTitle = "Nothing in this stage",
  emptyBody,
  className,
}: {
  stages: MobileBoardStage[];
  /**
   * What the rows are, for the line under the picker. Both forms, because a
   * stage holding one of something is common enough that "1 deals in
   * Discovery" would be on screen most of the time.
   */
  noun?: { one: string; many: string };
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  // Resolved rather than stored: a stage the reader picked can disappear when
  // the filters change, and the first stage holding anything is a better
  // landing place than an empty one. No effect needed, and no stale id.
  const active =
    stages.find((stage) => stage.id === picked) ??
    stages.find((stage) => stage.count > 0) ??
    stages[0];

  // A board with no stages at all — an unconfigured pipeline, or a filter that
  // excluded every one. The desktop strip shows an empty rail and its own
  // toolbar around it; a phone showed nothing whatsoever under the toolbar,
  // which reads as a page that failed to load rather than one with nothing in
  // it. Caught by screenshotting a tenant that had no leads.
  if (!active) {
    return (
      <div className={className}>
        <EmptyState title={emptyTitle} body={emptyBody} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Full-bleed, so a stage that does not fit is cut by the edge of the
          screen rather than by a gutter eight pixels inside it. A chip clipped
          at the screen edge is the phone's own idiom for "this scrolls"; one
          clipped short of it just looks broken, which is what the inset rail
          looked like. Snapping means a swipe lands on a chip rather than
          halfway through one. */}
      <div
        role="group"
        aria-label="Stages"
        className="scroll-rail -mx-[var(--content-gutter-x)] flex snap-x snap-proximity gap-2 px-[var(--content-gutter-x)] pb-1"
      >
        {stages.map((stage) => {
          const selected = stage.id === active.id;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setPicked(stage.id)}
              aria-pressed={selected}
              className={cn(
                "flex min-h-9 shrink-0 snap-start items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                selected
                  ? "border-[var(--border-strong)] bg-[var(--surface-muted)] font-medium text-[var(--text-strong)]"
                  : "border-[var(--border)] text-[var(--text-muted)]",
              )}
            >
              {stage.dot ? (
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", stage.dot)}
                />
              ) : null}
              {stage.label}
              <span className="font-mono tabular-nums text-[var(--text-subtle)]">
                {stage.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* What the stage holds, said in words. This line used to be the bare
          total the caller passed — "USD 4,050" under a row of chips, with
          nothing saying whether that was the stage, the board, or the page. */}
      <p className="text-sm text-[var(--text-muted)]">
        <span className="font-mono tabular-nums">{active.count}</span>{" "}
        {active.count === 1 ? noun.one : noun.many} in {active.label}
        {active.meta ? <> · {active.meta}</> : null}
      </p>

      <RecordList rows={active.rows} emptyTitle={emptyTitle} emptyBody={emptyBody} />
    </div>
  );
}
