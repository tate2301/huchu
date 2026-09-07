"use client";

import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The segmented views that sit at the left of a table's control row.
 *
 * Every records screen has them and they are all the same shape: a handful of
 * cuts of the same rows, each carrying the count of what it holds — "All 879",
 * "Active 842", "Boarders 218". The count is the point. A tab that only says
 * "Suspended" makes you press it to find out whether anybody is; one that says
 * "Suspended 3" has already answered.
 *
 * This is a tab strip, not a filter, and the difference is worth keeping: a
 * filter narrows and can be combined with other filters, a tab replaces the
 * population being looked at. So exactly one is ever lit, and choosing one
 * never leaves a second control silently in force.
 *
 * It lives here rather than in `common/` because it is the records area's
 * house style; if the fee ledger ever wants the same strip, that is the moment
 * to promote it, not before.
 */

export type RecordTab<Id extends string = string> = {
  id: Id;
  /** The name of the cut: "Active", "Boarders", "On the roll". */
  label: string;
  /**
   * How many rows it holds. Left undefined while the count is still being
   * read — the tab renders without it rather than flashing a zero, because a
   * zero that turns into 218 reads as data arriving late and wrong.
   */
  count?: number | string;
};

export function RecordTabs<Id extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<RecordTab<Id>>;
  value: Id;
  onChange: (next: Id) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1 text-sm whitespace-nowrap",
              active
                ? "bg-[color:var(--surface)] font-semibold shadow-[var(--shadow-xs)]"
                : "text-muted-foreground hover:text-[color:var(--text-body)]",
            )}
          >
            {tab.label}
            {tab.count === undefined ? null : (
              <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
