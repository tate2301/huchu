import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The container every CRM page sits in.
 *
 * Page widths had drifted to six different values across the module —
 * `max-w-4xl` through `max-w-[110rem]` — so moving between pages shifted the
 * content under you. Three names, one place to change them:
 *
 *   list    a record list or a dashboard — full width
 *   detail  a record page carrying a side rail — full width; the rail is what
 *           bounds the reading column, not a cap on the page
 *   narrow  a single column of form — an import wizard, a form builder
 *
 * `list` and `detail` are deliberately unbounded. `max-w-7xl` was a 1280px cap
 * on surfaces that are almost entirely tables and side-by-side panes: on a
 * 1920 screen with the sidebar open it left ~180px of dead margin on each
 * side, which is the "container-ish" gap the module was reported for. A page
 * that genuinely needs a reading measure asks for `narrow`, which is the only
 * width here that still means anything.
 */
const WIDTH = {
  list: "",
  detail: "",
  narrow: "max-w-3xl",
} as const;

export function CrmPage({
  width = "list",
  className,
  title,
  description,
  bandSlot,
  children,
}: {
  width?: keyof typeof WIDTH;
  className?: string;
  /**
   * Renders the sticky page band. Omit it and the page behaves exactly as
   * before — the band is opt-in so pages adopt it one at a time rather than
   * all sprouting a half-filled header at once.
   *
   * This is the page's *own* name, which is not always what the app bar shows:
   * the bar names the record you are in ("Taromax Hardware"), the band names
   * the view you are looking at.
   */
  title?: string;
  description?: string;
  /** Context the page needs permanently in view — a count, a total, a period. */
  bandSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full", WIDTH[width], className)}>
      {title ? (
        <div className="band-shell sticky top-0 z-30 mb-4 flex min-h-[var(--page-band-h)] items-center gap-2.5 border-b border-[var(--border)] bg-[var(--canvas)]">
          <h1 className="text-base font-bold leading-tight tracking-[-0.012em] text-[var(--text-strong)]">
            {title}
          </h1>
          {description ? (
            <span className="hidden min-w-0 truncate border-l border-[var(--border)] pl-2.5 text-sm text-[var(--text-subtle)] md:inline">
              {description}
            </span>
          ) : null}
          {bandSlot ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">{bandSlot}</div>
          ) : null}
        </div>
      ) : null}
      <div className="band-stack-content space-y-6">{children}</div>
    </div>
  );
}
