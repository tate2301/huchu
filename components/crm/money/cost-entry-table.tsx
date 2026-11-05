"use client";

import type { ReactNode } from "react";

import {
  RecordCell,
  RecordTable,
  RecordTableName,
  type RecordTableColumn,
} from "@/components/records/record-table";
import { StatusDot } from "@/components/management/ui";
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
      <span className="inline-flex items-baseline gap-2">
        <a
          href={entry.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-[var(--color-brand)] underline decoration-transparent underline-offset-2 hover:decoration-current"
        >
          Photo
        </a>
        {notReceipted}
      </span>
    );
  }
  if (entry.direction === "SPENT") return <StatusDot tone="warn" label="No receipt" />;
  return notReceipted ?? <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">—</span>;
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
  empty,
  emptyAction,
  onRemove,
  removable,
}: {
  label?: string;
  maxWidth?: number;
  entries: CostEntryRow[];
  isLoading?: boolean;
  layout?: "register" | "section";
  showPerson?: boolean;
  showProject?: boolean;
  showAgainst?: boolean;
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
}) {
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

  const columns: RecordTableColumn<CostEntryRow>[] = [
    {
      id: "what",
      label: "What",
      cell: (entry) => (
        <RecordTableName
          title={entry.description}
          subtitle={metaOf(entry)}
        />
      ),
    },
    {
      id: "day",
      label: "Day",
      width: "8.5rem",
      cell: (entry) => <RecordCell kind="date" value={dayOf(entry)} />,
    },
    ...(wide && showPerson
      ? [
          {
            id: "person",
            label: "Who",
            width: "11rem",
            cell: (entry: CostEntryRow) => (
              <RecordCell
                kind="relation"
                value={entry.log?.user.name ?? null}
                href={entry.log?.user.id ? `/crm/reps/${entry.log.user.id}` : null}
              />
            ),
          },
        ]
      : []),
    ...(wide && showProject
      ? [
          {
            id: "project",
            label: "Project",
            width: "12rem",
            cell: (entry: CostEntryRow) => (
              <RecordCell
                kind="relation"
                value={entry.project?.name ?? null}
                href={entry.project?.id ? `/crm/projects/${entry.project.id}` : null}
              />
            ),
          },
        ]
      : []),
    ...(wide && showAgainst
      ? [
          {
            id: "against",
            label: "Against",
            width: "10rem",
            cell: (entry: CostEntryRow) => (
              <RecordCell kind="text" value={againstOf(entry)} />
            ),
          },
        ]
      : []),
    {
      id: "receipt",
      label: "Receipt",
      width: "10rem",
      cell: (entry) => <ReceiptState entry={entry} />,
    },
    ...(split
      ? [
          {
            id: "in",
            label: "In",
            width: "8.5rem",
            align: "end" as const,
            cell: (entry: CostEntryRow) =>
              entry.direction === "RECEIVED" ? (
                <RecordCell kind="number" value={formatMoney(entry.amount, entry.currency)} />
              ) : null,
          },
          {
            id: "out",
            label: "Out",
            width: "8.5rem",
            align: "end" as const,
            cell: (entry: CostEntryRow) =>
              entry.direction === "SPENT" ? (
                <RecordCell kind="number" value={formatMoney(entry.amount, entry.currency)} />
              ) : null,
          },
        ]
      : [
          {
            id: "amount",
            label: "Amount",
            width: "8.5rem",
            align: "end" as const,
            cell: (entry: CostEntryRow) => (
              <RecordCell kind="number" value={formatMoney(entry.amount, entry.currency)} />
            ),
          },
        ]),
    ...(anyRemovable
      ? [
          {
            id: "remove",
            label: "",
            width: "3.5rem",
            align: "end" as const,
            cell: (entry: CostEntryRow) =>
              onRemove && canRemove(entry) ? (
                <IconButton
                  size="sm"
                  aria-label={`Remove ${entry.description}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(entry);
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <RecordTable
      rows={entries}
      columns={columns}
      rowHref={(entry) => `/crm/cost-tracker/${entry.id}`}
      isLoading={isLoading}
      emptyTitle={empty}
      emptyAction={emptyAction}
    />
  );
}
