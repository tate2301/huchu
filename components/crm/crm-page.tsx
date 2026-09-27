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
  children,
}: {
  width?: keyof typeof WIDTH;
  className?: string;
  children: ReactNode;
}) {
  // No band: the page names itself once, in the app bar, and the first thing
  // under the bar is the page's own toolbar or content.
  return (
    <div className={cn("band-stack-content mx-auto w-full space-y-6", WIDTH[width], className)}>
      {children}
    </div>
  );
}
