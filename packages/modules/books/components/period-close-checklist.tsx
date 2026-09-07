"use client";

import Link from "next/link";

import { ReportPanel } from "@corelithzw/ui/components/breakdown-panel";
import { Button } from "@corelithzw/ui/components/button";
import { Check } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * What still stands between this period and a close.
 *
 * ── Why a checklist and not a count ────────────────────────────────────────
 *
 * "2 blocking" tells you there is a problem and nothing about which problem,
 * so the next move is always the same: go and look. This is the looking, done
 * in advance — every gate that closing checks, whether it passes, and the one
 * figure that says how far off it is. A cleared item stays on the list rather
 * than disappearing, because "all journals posted: 42 of 42" is a fact worth
 * reading before you close a month, and a list that only shows failures cannot
 * tell you whether a check ran at all.
 *
 * Each unmet item links to the page that clears it. That is the whole point of
 * putting this next to the period table: the gap between finding out and doing
 * something about it should be one click.
 *
 * Items whose data this app does not yet hold — bank reconciliation,
 * depreciation runs — are deliberately absent rather than shown as permanently
 * unchecked. A gate that can never go green trains people to ignore the list.
 *
 * The close itself hangs off the bottom of the list rather than living in the
 * table or a toolbar, because the gates are the reason it is disabled: a button
 * greyed out somewhere else on the page is a mystery, and the same button under
 * the two items still failing explains itself.
 */

export type ChecklistItem = {
  label: string;
  done: boolean;
  /** The figure behind the verdict — "42 of 42", "12 pending". */
  note: string;
  /** Where to go to clear it. Omitted on items that are already met. */
  href?: string;
};

export type PeriodCloseAction = {
  /** Names the period it closes — "Close August 2026". */
  label: string;
  onClick: () => void;
  pending?: boolean;
};

export function PeriodCloseChecklist({
  items,
  className,
  closeAction,
}: {
  items: ChecklistItem[];
  className?: string;
  /** Omitted when there is no open period to close. */
  closeAction?: PeriodCloseAction;
}) {
  const outstanding = items.filter((item) => !item.done).length;
  const done = items.length - outstanding;

  return (
    <ReportPanel
      className={className}
      title="Before this period can close"
      note={`${done} of ${items.length} done`}
    >
      <div className="py-1">
        {items.map((item) => {
          const body = (
            <>
              {/*
                A filled tick for done, a hollow ring for not. The ring is
                deliberately not a red cross: most of these are ordinary
                month-end work rather than errors, and marking a normal
                unfinished task as a failure makes the whole list read as an
                alarm.
              */}
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  item.done
                    ? "border-[var(--tone-success)] bg-[var(--tone-success)]"
                    : "border-[var(--border-strong)] bg-[var(--surface)]",
                )}
              >
                {item.done ? (
                  <Check className="size-2.5 text-[var(--surface)]" aria-hidden="true" />
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  item.done ? "text-[var(--text-muted)]" : "font-medium text-[var(--text-strong)]",
                )}
              >
                {item.label}
              </span>
              <span
                className="shrink-0 font-mono text-sm tabular-nums"
                style={{
                  color: item.done ? "var(--gray-400)" : "var(--badge-bad-fg)",
                }}
              >
                {item.note}
              </span>
            </>
          );

          const rowClass =
            "flex min-h-[30px] items-center gap-2.5 px-[13px] hover:bg-[var(--canvas)]";

          if (item.href && !item.done) {
            return (
              <Link key={item.label} href={item.href} className={rowClass}>
                {body}
              </Link>
            );
          }

          return (
            <div key={item.label} className={rowClass}>
              {body}
            </div>
          );
        })}
      </div>

      {closeAction ? (
        <div className="px-[13px] pb-[13px] pt-1.5">
          <Button
            type="button"
            className="w-full"
            disabled={outstanding > 0 || closeAction.pending}
            onClick={closeAction.onClick}
          >
            {closeAction.label}
          </Button>
          {outstanding > 0 ? (
            <p className="acct-caption mt-1.5 text-center">
              {outstanding === 1 ? "1 item still open" : `${outstanding} items still open`}
            </p>
          ) : null}
        </div>
      ) : null}
    </ReportPanel>
  );
}
