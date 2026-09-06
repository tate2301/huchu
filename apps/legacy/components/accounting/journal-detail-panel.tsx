"use client";

import { useMemo } from "react";
import { format } from "date-fns";

import { ReportPanel } from "@corelithzw/ui/components/breakdown-panel";
import { ReportTable, amt, dim, txt, type ReportRow } from "@/components/accounting/report-table";
import { Button } from "@corelithzw/ui/components/button";
import type { JournalEntryRecord } from "@/lib/api";
import { formatAmount } from "@/lib/accounting/format";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The lifecycle a journal actually has.
 *
 * `JournalEntryRecord.status` is still typed DRAFT | POSTED in lib/api.ts, but
 * the schema's JournalStatus enum has four states and the reverse endpoint
 * writes the third of them — reversing a posted entry leaves it REVERSED. Read
 * through this type, a reversed journal is drawn as itself; read through the
 * narrower one it came back as "not posted", which is to say as a draft.
 * Widening the shared record type belongs in lib/api.ts, not here.
 */
export type JournalStatus = "DRAFT" | "POSTED" | "REVERSED" | "VOIDED";

export const journalStatusLabel: Record<JournalStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  REVERSED: "Reversed",
  VOIDED: "Voided",
};

/**
 * Work still owed reads warn, work done reads ok. A reversed entry is muted
 * because it is history rather than a problem — something later cancelled it
 * out — and a voided one is danger because it is an entry that should never
 * have been written.
 */
export const journalStatusTone: Record<JournalStatus, "warn" | "ok" | "mute" | "bad"> = {
  DRAFT: "warn",
  POSTED: "ok",
  REVERSED: "mute",
  VOIDED: "bad",
};

export const journalStatusOf = (entry: JournalEntryRecord): JournalStatus =>
  entry.status as JournalStatus;

/**
 * One journal entry, opened.
 *
 * A journal is not its total — it is which accounts moved and in which
 * direction, and whether the two sides agree. The list can carry the first
 * fact; only this can carry the other two, which is why the design pins it
 * beside the list rather than hiding it behind a route change.
 *
 * The totals row is the point of the whole panel. Double-entry means debits
 * equal credits, and the one thing worth checking about any entry — posted or
 * draft — is that they do. It is drawn in brand ink when they agree and danger
 * ink when they do not, so an unbalanced draft is visible without reading the
 * two figures and subtracting them yourself.
 */
export function JournalDetailPanel({
  entry,
  accountsById,
  onPost,
  posting = false,
  onReverse,
  reversing = false,
  className,
}: {
  entry: JournalEntryRecord | null;
  accountsById: Map<string, { code: string; name: string }>;
  /** Posts the open entry. Omitted where the caller has nothing to post with. */
  onPost?: () => void;
  posting?: boolean;
  /** Reverses the open entry. Omitted where the caller has nothing to reverse with. */
  onReverse?: () => void;
  reversing?: boolean;
  className?: string;
}) {
  const { rows, totalDebit, totalCredit } = useMemo(() => {
    if (!entry?.lines) return { rows: [] as ReportRow[], totalDebit: 0, totalCredit: 0 };

    let debitSum = 0;
    let creditSum = 0;

    const built = entry.lines.map((line, index): ReportRow => {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);
      debitSum += debit;
      creditSum += credit;

      // The line may carry its own account (the detail endpoint embeds it);
      // fall back to the chart lookup when the list response does not.
      const account = line.account ?? (line.accountId ? accountsById.get(line.accountId) : undefined);
      return {
        id: line.id ?? String(index),
        cells: [
          txt(account?.code ?? "—", { mono: true, tone: "subtle" }),
          txt(account?.name ?? "Unknown account", { tone: account ? "body" : "bad" }),
          // A side with nothing on it is a dash. Half the cells in a journal
          // are empty by nature, and a column of 0.00 makes every line look
          // like it moved money both ways.
          debit === 0 ? dim() : amt(debit.toFixed(2)),
          credit === 0 ? dim() : amt(credit.toFixed(2)),
        ],
      };
    });

    return { rows: built, totalDebit: debitSum, totalCredit: creditSum };
  }, [entry, accountsById]);

  if (!entry) {
    return (
      <ReportPanel className={className} title="No entry open" note="pick one">
        <p className="px-[13px] py-4 text-sm text-[var(--text-muted)]">
          Choose a journal reference from the list to see the accounts it moved.
        </p>
      </ReportPanel>
    );
  }

  const balanced = Math.round((totalDebit - totalCredit) * 100) === 0;
  const status = journalStatusOf(entry);
  const period = entry.period
    ? `${format(new Date(entry.period.startDate), "d MMM")} – ${format(
        new Date(entry.period.endDate),
        "d MMM yyyy",
      )}`
    : "no period";

  return (
    <ReportPanel
      className={className}
      title={`JE-${entry.entryNumber}`}
      note={journalStatusLabel[status] ?? entry.status}
    >
      <div className="px-[13px] pb-1.5 pt-2.5">
        <div className="text-sm font-bold text-[var(--text-strong)]">
          {entry.description || "No memo"}
        </div>
        <div className="mt-0.5 text-sm text-[var(--text-subtle)]">
          {format(new Date(entry.entryDate), "d MMM yyyy")} · {period}
        </div>
      </div>

      <ReportTable
        label={`Lines on journal ${entry.entryNumber}`}
        tracks="92px minmax(0,1fr) 100px 100px"
        columns={[
          { label: "Code" },
          { label: "Account" },
          { label: "Debit", align: "right" },
          { label: "Credit", align: "right" },
        ]}
        rows={rows}
        emptyLabel="This entry has no lines."
      />

      {rows.length > 0 ? (
        <div
          className="grid min-h-[34px] items-center border-t border-[var(--border)] bg-[var(--canvas)] px-[13px]"
          style={{ gridTemplateColumns: "92px minmax(0,1fr) 100px 100px" }}
        >
          <span />
          <span className="pr-2.5 text-sm font-bold text-[var(--text-muted)]">Totals</span>
          <span
            className={cn("pr-3 text-right font-mono text-sm font-bold tabular-nums")}
            style={{ color: balanced ? "var(--brand-strong)" : "var(--badge-bad-fg)" }}
          >
            {formatAmount(totalDebit)}
          </span>
          <span
            className="text-right font-mono text-sm font-bold tabular-nums"
            style={{ color: balanced ? "var(--brand-strong)" : "var(--badge-bad-fg)" }}
          >
            {formatAmount(totalCredit)}
          </span>
        </div>
      ) : null}

      {rows.length > 0 && !balanced ? (
        <p className="border-t border-[var(--border-subtle)] px-[13px] py-2 text-sm text-[var(--badge-bad-fg)]">
          Debits and credits differ by {formatAmount(Math.abs(totalDebit - totalCredit))}. This entry
          cannot be posted until they agree.
        </p>
      ) : null}

      {/* The actions belong to the entry you have just read, so they close the
          panel rather than sitting on a row in the list.

          Each is offered only where the ledger would accept it. Posting applies
          to a draft, and to a balanced one — an entry whose sides disagree is
          refused, which is what the line above already says. Reversing applies
          only to a posted entry: there is nothing to cancel out in a draft, and
          an entry that has already been reversed or voided is finished. The
          design draws both side by side, but a button the API would turn away
          is worse than an absent one. */}
      {status === "DRAFT" && onPost ? (
        <div className="flex gap-1.5 px-[13px] pb-[13px] pt-[11px]">
          <Button
            type="button"
            size="sm"
            className="h-[30px] flex-1"
            onClick={onPost}
            disabled={posting || rows.length === 0 || !balanced}
          >
            {posting ? "Posting…" : "Post this journal"}
          </Button>
        </div>
      ) : status === "POSTED" && onReverse ? (
        <div className="flex gap-1.5 px-[13px] pb-[13px] pt-[11px]">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-[30px]"
            onClick={onReverse}
            disabled={reversing}
          >
            {reversing ? "Reversing…" : "Reverse"}
          </Button>
        </div>
      ) : null}
    </ReportPanel>
  );
}
