"use client";

import type { ReactNode } from "react";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { EntityLink } from "@/components/records/entity-link";
import {
  RecordCell,
  RecordTable,
  type RecordTableColumn,
} from "@/components/records/record-table";
import { Calendar, Coins, FileText, Receipt, User, Wallet, Work } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { CATEGORY_LABELS, formatMoney, type CostEntryRow } from "./money";

/** Money in reads as money in: signed, so a column of them can be added by eye. */
function signedAmount(entry: CostEntryRow): string {
  return `${entry.direction === "RECEIVED" ? "+" : "−"}${formatMoney(entry.amount, entry.currency)}`;
}

/**
 * The receipt, or the fact that there is none.
 *
 * Only spending owes a receipt. Money received is evidenced by the requisition
 * it came from or by the customer's own paperwork, so a blank there is not a
 * gap and is not drawn as one.
 */
function ReceiptCell({ entry }: { entry: CostEntryRow }) {
  if (entry.receiptUrl) {
    return (
      <a
        href={entry.receiptUrl}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-[var(--brand-strong)] hover:underline"
      >
        Photo
      </a>
    );
  }
  if (entry.direction === "SPENT") {
    return <span className="text-sm font-medium text-[var(--badge-bad-fg)]">No receipt</span>;
  }
  return <RecordCell value={null} />;
}

/**
 * Lines of money in somebody's hands, as a register.
 *
 * A line is not a record — there is nothing of its own to open — so rows do
 * not link; the receipt and the project in it do. Which columns show depends
 * on where the table sits: a person's own money leaves out whose it is, a
 * project's leaves out which project.
 */
export function CostEntryTable({
  entries,
  isLoading,
  showPerson = true,
  showProject = true,
  showRequisition = true,
  emptyTitle = "No money has moved",
  emptyBody,
  emptyAction,
}: {
  entries: CostEntryRow[];
  isLoading?: boolean;
  showPerson?: boolean;
  showProject?: boolean;
  showRequisition?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
}) {
  const columns: RecordTableColumn<CostEntryRow>[] = [
    {
      id: "what",
      label: "What",
      icon: FileText,
      cell: (entry) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-[var(--text-strong)]">
            {entry.description}
          </span>
          <span className="acct-caption block truncate">{CATEGORY_LABELS[entry.category]}</span>
        </span>
      ),
    },
    {
      id: "day",
      label: "Day",
      icon: Calendar,
      width: "7.5rem",
      cell: (entry) => <RecordCell kind="date" value={entry.log?.logDate.slice(0, 10)} />,
    },
    ...(showPerson
      ? [
          {
            id: "person",
            label: "Who",
            icon: User,
            width: "9rem",
            cell: (entry: CostEntryRow) => (
              <RecordCell
                kind="relation"
                value={entry.log?.user.name}
                href={entry.log ? `/crm/reps/${entry.log.user.id}` : null}
              />
            ),
          },
        ]
      : []),
    ...(showProject
      ? [
          {
            id: "project",
            label: "Project",
            icon: Work,
            width: "11rem",
            cell: (entry: CostEntryRow) =>
              entry.project ? (
                <span className="block truncate">
                  <EntityLink href={`/crm/projects/${entry.project.id}`}>{entry.project.name}</EntityLink>
                </span>
              ) : (
                <RecordCell value={null} />
              ),
          },
        ]
      : []),
    ...(showRequisition
      ? [
          {
            id: "requisition",
            label: "From",
            icon: Wallet,
            width: "8rem",
            cell: (entry: CostEntryRow) => (
              <RecordCell kind="code" value={entry.requisition?.requisitionNo} />
            ),
          },
        ]
      : []),
    {
      id: "receipt",
      label: "Receipt",
      icon: Receipt,
      width: "7rem",
      cell: (entry) => <ReceiptCell entry={entry} />,
    },
    {
      id: "amount",
      label: "Amount",
      icon: Coins,
      width: "9rem",
      align: "end",
      cell: (entry) => <RecordCell kind="money" value={signedAmount(entry)} />,
    },
  ];

  return (
    <RecordTable
      rows={entries}
      columns={columns}
      isLoading={isLoading}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      emptyAction={emptyAction}
      mobile={
        <CostEntryList
          entries={entries}
          isLoading={isLoading}
          showPerson={showPerson}
          showProject={showProject}
          emptyTitle={emptyTitle}
          emptyBody={emptyBody}
          emptyAction={emptyAction}
        />
      }
    />
  );
}

/** The same lines on a phone: what, whose and when on the left, the money on the right. */
function CostEntryList({
  entries,
  isLoading,
  showPerson,
  showProject,
  emptyTitle,
  emptyBody,
  emptyAction,
}: {
  entries: CostEntryRow[];
  isLoading?: boolean;
  showPerson: boolean;
  showProject: boolean;
  emptyTitle: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="space-y-1.5" aria-busy="true" aria-live="polite">
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }
  if (entries.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  return (
    <ul className="border-t border-[var(--table-divider)]">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-start justify-between gap-3 border-b border-[var(--table-divider)] py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text-strong)]">{entry.description}</p>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {[
                entry.log?.logDate.slice(0, 10),
                showPerson ? entry.log?.user.name : null,
                showProject ? entry.project?.name : null,
                CATEGORY_LABELS[entry.category],
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={cn(
                "font-mono text-sm font-medium tabular-nums",
                entry.direction === "RECEIVED"
                  ? "text-[var(--badge-ok-fg)]"
                  : "text-[var(--text-strong)]",
              )}
            >
              {signedAmount(entry)}
            </p>
            <ReceiptCell entry={entry} />
          </div>
        </li>
      ))}
    </ul>
  );
}
