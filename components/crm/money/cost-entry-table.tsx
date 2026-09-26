"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnRowAction,
  StatusDot,
  type ColumnListColumn,
} from "@/components/management/ui";
import { IconButton } from "@/components/ui/icon-button";
import { Trash2 } from "@/lib/icons";

import { CATEGORY_LABELS, formatDate, formatMoney, type CostEntryRow } from "./money";

/**
 * The receipt, or the fact that there is none.
 *
 * Only spending owes a photo of a receipt. Money received is evidenced by the
 * requisition it came from or by the customer's own paperwork, so a blank
 * there is not a gap and is not drawn as one. What cash from a customer does
 * owe is the office's receipt, and a line the office has not caught up with
 * says so here, beside any photo it has.
 *
 * States are a dot and the word (rule 5): amber for a photo still to attach,
 * red for cash the office has not receipted.
 */
function ReceiptState({ entry }: { entry: CostEntryRow }) {
  const notReceipted = entry.notReceipted ? <StatusDot tone="danger" label="Not receipted" /> : null;

  if (entry.receiptUrl) {
    return (
      <span className="inline-flex items-baseline gap-3">
        <a
          href={entry.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[var(--brand-strong)] underline decoration-transparent underline-offset-2 hover:decoration-current"
        >
          Photo
        </a>
        {notReceipted}
      </span>
    );
  }
  if (entry.direction === "SPENT") return <StatusDot tone="warn" label="No receipt" />;
  return notReceipted ?? <ColumnFigure tone="muted">—</ColumnFigure>;
}

/**
 * What a line was against: the requisition money spent came out of, or the
 * invoice money received was paying.
 */
function againstOf(entry: CostEntryRow): string | null {
  if (entry.direction === "SPENT") return entry.requisition?.requisitionNo ?? null;
  return entry.invoiceDocument?.invoice?.invoiceNumber ?? null;
}

function dayOf(entry: CostEntryRow): string | null {
  return entry.log ? formatDate(entry.log.logDate.slice(0, 10)) : null;
}

/**
 * Lines of money in somebody's hands.
 *
 * The description opens the line's own page, where its receipt is shown at a
 * size somebody can check against the figure; the receipt and the project in
 * the row link where they point. Money in and money out
 * are two columns rather than one column of signed figures: a column of
 * "−USD" is a column of minus signs to read past, and a reader adding up
 * what went out wants the outs lined up on their own. Where every line goes
 * the same way — a requisition's report is all spending — the one column
 * says "Amount".
 *
 * Two layouts. The cost tracker's register has the page's width and gives
 * whose, which project and what against a column each. A record's section —
 * a project's spend, a requisition's report, a person's money — is a third of
 * that, so the same facts ride on the line under the description instead of
 * pushing the figures off the edge of the pane.
 *
 * Which facts show depends on where the list sits: a person's own money
 * leaves out whose it is, a project's leaves out which project, a
 * requisition's report leaves out the requisition every line is against.
 */
export function CostEntryTable({
  entries,
  isLoading,
  layout = "section",
  showPerson = true,
  showProject = true,
  showAgainst = true,
  label = "Money",
  empty,
  emptyAction,
  onRemove,
  removable,
  maxWidth,
}: {
  entries: CostEntryRow[];
  isLoading?: boolean;
  layout?: "register" | "section";
  showPerson?: boolean;
  showProject?: boolean;
  showAgainst?: boolean;
  /** The list's accessible name — its section heading's words. */
  label?: string;
  /** Said once, in the meta ink, when there are no lines. */
  empty: string;
  /** The one verb that fixes an empty list — "Clear the filters". */
  emptyAction?: ReactNode;
  /**
   * Take a line back out — offered only where the page knows the line is the
   * viewer's own and its day and requisition are still open. The server
   * refuses the rest regardless.
   */
  onRemove?: (entry: CostEntryRow) => void;
  /** Which lines `onRemove` is offered on, where not every line is. */
  removable?: (entry: CostEntryRow) => boolean;
  maxWidth?: number;
}) {
  const width = maxWidth ?? (layout === "register" ? 1400 : 760);

  if (isLoading) {
    return (
      <div className="space-y-1.5" aria-busy="true" aria-live="polite" style={{ maxWidth: width }}>
        <Skeleton height={38} />
        <Skeleton height={38} />
        <Skeleton height={38} />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-3">
        <ColumnList label={label} columns={[]} rows={[]} empty={empty} maxWidth={width} />
        {emptyAction}
      </div>
    );
  }

  const canRemove = (entry: CostEntryRow) => Boolean(onRemove) && (removable?.(entry) ?? true);
  const anyRemovable = entries.some(canRemove);
  const wide = layout === "register";
  const hasIn = entries.some((entry) => entry.direction === "RECEIVED");
  const hasOut = entries.some((entry) => entry.direction === "SPENT");
  const split = hasIn && hasOut;

  // In a section the facts that have no column of their own ride under the
  // description, after the category.
  const metaOf = (entry: CostEntryRow) =>
    [
      CATEGORY_LABELS[entry.category],
      !wide && showPerson ? entry.log?.user.name : null,
      !wide && showProject ? entry.project?.name : null,
      !wide && showAgainst ? againstOf(entry) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const columns: ColumnListColumn[] = [
    { id: "what", label: "What" },
    { id: "day", label: "Day" },
    ...(wide && showPerson ? [{ id: "person", label: "Who" }] : []),
    ...(wide && showProject ? [{ id: "project", label: "Project" }] : []),
    ...(wide && showAgainst ? [{ id: "against", label: "Against" }] : []),
    { id: "receipt", label: "Receipt" },
    ...(split
      ? [
          { id: "in", label: "In", align: "end" as const },
          { id: "out", label: "Out", align: "end" as const },
        ]
      : [{ id: "amount", label: "Amount", align: "end" as const }]),
    ...(anyRemovable ? [{ id: "remove", label: "" }] : []),
  ];

  const figure = (entry: CostEntryRow) => (
    <ColumnFigure>{formatMoney(entry.amount, entry.currency)}</ColumnFigure>
  );

  return (
    <>
      <div className="hidden md:block">
        <ColumnList
          label={label}
          maxWidth={width}
          columns={columns}
          rows={entries.map((entry) => ({
            id: entry.id,
            cells: {
              what: (
                <ColumnName name={entry.description} meta={metaOf(entry)} href={`/crm/cost-tracker/${entry.id}`} />
              ),
              day: <ColumnFigure tone="muted">{dayOf(entry) ?? "—"}</ColumnFigure>,
              person: entry.log ? (
                <Link
                  href={`/crm/reps/${entry.log.user.id}`}
                  className="text-sm text-[var(--brand-strong)] underline decoration-transparent underline-offset-2 hover:decoration-current"
                >
                  {entry.log.user.name ?? "Unnamed"}
                </Link>
              ) : null,
              project: entry.project ? (
                <Link
                  href={`/crm/projects/${entry.project.id}`}
                  className="text-sm text-[var(--brand-strong)] underline decoration-transparent underline-offset-2 hover:decoration-current"
                >
                  {entry.project.name}
                </Link>
              ) : (
                <ColumnFigure tone="muted">—</ColumnFigure>
              ),
              against: againstOf(entry) ? (
                <ColumnFigure tone="muted">{againstOf(entry)}</ColumnFigure>
              ) : (
                <ColumnFigure tone="muted">—</ColumnFigure>
              ),
              receipt: <ReceiptState entry={entry} />,
              in: entry.direction === "RECEIVED" ? figure(entry) : null,
              out: entry.direction === "SPENT" ? figure(entry) : null,
              amount: figure(entry),
              remove:
                onRemove && canRemove(entry) ? (
                  <ColumnRowAction>
                    <IconButton size="sm" aria-label={`Remove ${entry.description}`} onClick={() => onRemove(entry)}>
                      <Trash2 />
                    </IconButton>
                  </ColumnRowAction>
                ) : null,
            },
          }))}
        />
      </div>

      {/* A phone: what, when and whose on the left, the money and its
          receipt on the right. Four columns of figures do not fit 390px, and
          a list that scrolls sideways hides the figure you came for. */}
      <ul className="md:hidden">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <Link
                href={`/crm/cost-tracker/${entry.id}`}
                className="block truncate text-sm text-[var(--text-strong)] hover:underline"
              >
                {entry.description}
              </Link>
              <p className="truncate text-sm text-[var(--text-muted)]">
                {[
                  dayOf(entry),
                  showPerson ? entry.log?.user.name : null,
                  showProject ? entry.project?.name : null,
                  showAgainst ? againstOf(entry) : null,
                  CATEGORY_LABELS[entry.category],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ColumnFigure>
                {split && entry.direction === "RECEIVED" ? "+" : ""}
                {formatMoney(entry.amount, entry.currency)}
              </ColumnFigure>
              <ReceiptState entry={entry} />
            </div>
            {onRemove && canRemove(entry) ? (
              <IconButton size="sm" aria-label={`Remove ${entry.description}`} onClick={() => onRemove(entry)}>
                <Trash2 />
              </IconButton>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
