import type { ReactNode } from "react";

import { Stack } from "@corelithzw/react";

import { cn } from "@/lib/utils";

/**
 * A list of things, for a phone.
 *
 * The same grammar `RecordList` uses — one row per item, at most two lines
 * inside it, rows separated by whitespace rather than ruled off — but for rows
 * that are not links. `RecordListRow` requires an `href` because a record row
 * is something you open; a rep's win rate or a workflow's failure count is
 * something you read, and it has nowhere to go.
 *
 * This exists so a table can become a list on a phone without every caller
 * retyping the row. A table is the right shape when somebody is comparing a
 * column of numbers on a desk. On a 390px screen it is four columns of
 * `font-mono` fighting over 318px, and the honest answer is a list where the
 * one number that matters sits on the right and the rest goes underneath.
 */

export type MobileRowProps = {
  /** The thing being described — a name, a workflow, a source. */
  title: ReactNode;
  /** The supporting line. Keep it to one; a third line is a card, not a row. */
  subtitle?: ReactNode;
  /** The figure that earns the right-hand side. Rendered `font-mono`. */
  value?: ReactNode;
  /** A chip or badge beside the title. */
  status?: ReactNode;
  className?: string;
};

export function MobileRow({ title, subtitle, value, status, className }: MobileRowProps) {
  return (
    <li className={cn("flex items-baseline gap-3 py-1.5", className)}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--text-strong)]">
            {title}
          </span>
          {status}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
            {subtitle}
          </span>
        ) : null}
      </span>

      {value ? (
        <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-strong)]">
          {value}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The container. `Stack` rather than a bare `ul` so the spacing comes from the
 * design system's scale instead of a number picked per call site.
 */
export function MobileRows({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Stack as="ul" gap="xs" className={cn("min-w-0", className)}>
      {children}
    </Stack>
  );
}
