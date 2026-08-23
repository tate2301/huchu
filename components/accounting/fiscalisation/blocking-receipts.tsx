"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/ui/status-chip";
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
 */

/** ZIMRA statuses mapped onto the design system's canonical tones rather than
 *  passed through raw: `PENDING` and `FAILED` happen to normalise correctly,
 *  but relying on that coincidence would break silently if a status is renamed. */
const RECEIPT_TONE: Record<string, string> = {
  PENDING: "pending",
  FAILED: "failing",
  SUCCESS: "passing",
  VOIDED: "inactive",
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Global no</TableHead>
              <TableHead>Waiting</TableHead>
              <TableHead>Last error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.map((receipt) => (
              <TableRow key={receipt.id}>
                <TableCell>
                  <div className="font-mono">{receipt.sourceRef ?? receipt.receiptNumber ?? receipt.id}</div>
                  <div className="acct-caption">
                    {SOURCE_KIND_LABELS[receipt.sourceKind]}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusChip
                    status={RECEIPT_TONE[receipt.status] ?? receipt.status}
                    label={receipt.status}
                  />
                  {receipt.attemptCount > 0 ? (
                    <div className="acct-caption">
                      {receipt.attemptCount} attempt{receipt.attemptCount === 1 ? "" : "s"}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono">{receipt.receiptGlobalNo ?? "-"}</TableCell>
                <TableCell>
                  <TimeAgo value={receipt.createdAt} />
                  {receipt.nextRetryAt ? (
                    <div className="acct-caption">
                      retry <TimeAgo value={receipt.nextRetryAt} />
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="acct-caption">
                  {receipt.lastError ?? "Not yet submitted"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
