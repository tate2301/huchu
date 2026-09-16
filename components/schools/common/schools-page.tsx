import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The container a campus page sits in.
 *
 * Every route under `/schools` wraps its content in its own `max-w-…` — mostly
 * `max-w-7xl`, some `max-w-5xl`, one `max-w-4xl` — so moving between the roll,
 * the ledger and a record page shifts the content under you. This is the same
 * three names `components/crm/crm-page.tsx` settled on, deliberately identical
 * so the two modules converge rather than each carrying a good answer:
 *
 *   list    a register or a dashboard — full width
 *   detail  a record page carrying a side rail — full width; the rail is what
 *           bounds the reading column, not a cap on the page
 *   narrow  a single column of form — an import wizard, a bulk invoice run
 *
 * `list` and `detail` are unbounded on purpose. A 1280px cap on a fee ledger
 * or a register board — surfaces that are almost entirely columns — leaves
 * ~180px of dead margin each side of a 1920 screen on exactly the pages that
 * are short of width. A page that genuinely wants a reading measure asks for
 * `narrow`, which is the only width here that still means anything.
 *
 * ## The sticky stack
 *
 * The content is wrapped in `band-stack-content`, which publishes
 * `--stack-top` as the height of the band above it. That is what lets the
 * options row and a table header pin *under* the band rather than at a guessed
 * offset — and a guessed offset does not fail loudly, it just pushes the
 * header down the page and leaves a strip of nothing above it.
 */
const WIDTH = {
  list: "",
  detail: "",
  narrow: "max-w-3xl",
} as const;

export function SchoolsPage({
  width = "list",
  className,
  band,
  children,
}: {
  width?: keyof typeof WIDTH;
  className?: string;
  /**
   * The state strip — `PageBand`. Kept as a slot rather than as props because
   * the page is named once, in the app bar, and the band under it carries
   * numbers that change. There is no title to pass: a page that repeats its
   * own name below a bar that already says it spends a band of vertical space
   * on nothing.
   */
  band?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full", WIDTH[width], className)}>
      {band}
      {/* `band-stack-content` carries the work-surface panel scale as well as
          the stack offset, so it is applied either way; with no band there is
          nothing above the content and the offset goes back to zero rather
          than reserving 44px for a band that was never drawn. */}
      <div
        className="band-stack-content space-y-4"
        style={band ? undefined : ({ "--stack-top": "0px" } as CSSProperties)}
      >
        {children}
      </div>
    </div>
  );
}
