"use client";

import { ReportTable, dim, node, num, type BadgeTone } from "@/components/accounting/report-table";
import { TimeAgo } from "@/components/ui/time-ago";
import { SOURCE_KIND_LABELS } from "@/components/accounting/fiscalisation/receipt-mapping";
import type { BlockingReceiptWire } from "@/components/accounting/fiscalisation/types";

/**
 * FD-2.2 / FD-7.1 — the receipts holding a fiscal day open, by name.
 *
 * This table is the reason the close refusal is worth showing at all. A day
 * that "cannot close" is a dead end at 6pm; a day that cannot close *because*
 * till sale RS-1043 has been FAILED for forty minutes with `connect ETIMEDOUT`
 * is a decision — replay it, or void it and let the day go. Every column here
 * exists to get the supervisor to that decision:
 *
 *   - **Receipt** names the source document, because that is what is on the
 *     spike in front of them; the fiscal row's UUID is unfindable.
 *   - **Global no** is the number ZIMRA has not seen. A gap in that sequence is
 *     what makes this blocking rather than merely untidy.
 *   - **Waiting** is the age, which separates a blip from a lost shift.
 *   - **Last error** is the actual failure text, not a category.
 *
 * Rendered in two places (inside a device card, and inside the 409 refusal), so
 * the two can never describe the same receipt differently.
 *
 * `ReportTable` rather than a bare `<Table>`: this is an accounting table on an
 * accounting page, and it was the last one still setting its own row height and
 * column padding.
 */

/** ZIMRA statuses mapped onto the table's badge tones rather than passed
 *  through raw, so a renamed status fails here loudly instead of silently
 *  falling back to a neutral chip. */
const RECEIPT_TONE: Record<string, BadgeTone> = {
  PENDING: "warn",
  FAILED: "bad",
  SUCCESS: "ok",
  VOIDED: "mute",
};

export function BlockingReceiptsTable({
  receipts,
  truncated,
  total,
}: {
  receipts: BlockingReceiptWire[];
  truncated: boolean;
  /** The true count, which may exceed the rows listed. */
  total: number;
}) {
  if (receipts.length === 0) return null;

  return (
    <div className="space-y-2">
      <ReportTable
        label="Receipts blocking this fiscal day"
        tracks="minmax(0,1.1fr) 110px 100px 120px minmax(0,1.4fr)"
        columns={[
          { label: "Receipt" },
          { label: "Status" },
          { label: "Global no", align: "right" },
          { label: "Waiting" },
          { label: "Last error" },
        ]}
        rows={receipts.map((receipt) => ({
          id: receipt.id,
          cells: [
            node(
              <div className="min-w-0">
                <div className="truncate font-mono text-sm text-[var(--text-strong)]">
                  {receipt.sourceRef ?? receipt.receiptNumber ?? receipt.id}
                </div>
                <div className="acct-caption">{SOURCE_KIND_LABELS[receipt.sourceKind]}</div>
              </div>,
            ),
            node(
              <div className="min-w-0">
                <span className="acct-badge" data-tone={RECEIPT_TONE[receipt.status] ?? "mute"}>
                  {receipt.status}
                </span>
                {receipt.attemptCount > 0 ? (
                  <div className="acct-caption">
                    {receipt.attemptCount} attempt{receipt.attemptCount === 1 ? "" : "s"}
                  </div>
                ) : null}
              </div>,
            ),
            receipt.receiptGlobalNo === null
              ? dim()
              : num(String(receipt.receiptGlobalNo)),
            node(
              <div className="min-w-0 text-sm text-[var(--text-body)]">
                <TimeAgo value={receipt.createdAt} />
                {receipt.nextRetryAt ? (
                  <div className="acct-caption">
                    retry <TimeAgo value={receipt.nextRetryAt} />
                  </div>
                ) : null}
              </div>,
            ),
            // A node rather than a text cell: the error is the actionable part
            // of the row, and a text cell truncates it to one line.
            node(<span className="acct-caption">{receipt.lastError ?? "Not yet submitted"}</span>),
          ],
        }))}
      />
      {truncated ? (
        // Said out loud, because a list silently cut at eight rows reads as
        // "eight receipts to fix" when it may be eighty.
        <p className="acct-caption">
          Showing the {receipts.length} oldest of {total}. Clear these and refresh to see the rest.
        </p>
      ) : null}
    </div>
  );
}
