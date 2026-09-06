"use client";

import { Badge } from "@corelithzw/react";

import { summariseBilling } from "@/lib/crm/billing-summary";
import { cn } from "@corelithzw/ui/lib/utils";

import { formatMoney, type LeadDocument } from "./document-types";

/**
 * Where the money on this deal stands, in one line.
 *
 * The documents were all on the record and the answer to "how much of this
 * have we been paid?" was to open each invoice and add up. That is the
 * question a deal exists to answer, so it is answered before the list rather
 * than inside it.
 *
 * A deposit gets its own figure because it means something different from
 * "some of the bill": it is the reason the work started.
 */
export function BillingBand({
  documents,
  currency,
  className,
}: {
  documents: LeadDocument[];
  currency: string;
  className?: string;
}) {
  const summary = summariseBilling(documents, currency);

  // Nothing raised, nothing taken — there is no position to report.
  if (documents.length === 0) return null;

  const figures: Array<{ label: string; value: number; tone?: "danger" | "success" }> = [
    ...(summary.quoted > 0 ? [{ label: "Quoted", value: summary.quoted }] : []),
    { label: "Invoiced", value: summary.invoiced },
    { label: "Paid", value: summary.paid, tone: "success" as const },
    {
      label: "Outstanding",
      value: summary.outstanding,
      tone: summary.outstanding > 0 ? ("danger" as const) : undefined,
    },
    ...(summary.deposits > 0 ? [{ label: "Deposit", value: summary.deposits }] : []),
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-x-6 gap-y-2 border-y border-[var(--border-subtle)] py-3",
        className,
      )}
    >
      {figures.map((figure) => (
        <div key={figure.label}>
          <p className="text-sm text-[var(--text-muted)]">{figure.label}</p>
          <p
            className={cn(
              "font-mono text-sm tabular-nums",
              figure.tone === "danger" && "text-[var(--status-danger-text)]",
              figure.tone === "success" && "text-[var(--status-success-text)]",
            )}
          >
            {formatMoney(figure.value, summary.currency)}
          </p>
        </div>
      ))}

      <div className="ml-auto">
        {summary.settled ? (
          <Badge tone="success">Settled</Badge>
        ) : summary.openInvoices > 0 ? (
          <Badge tone="warn">
            {summary.openInvoices} invoice{summary.openInvoices === 1 ? "" : "s"} open
          </Badge>
        ) : summary.deposits > 0 ? (
          <Badge tone="neutral">Deposit taken, not yet billed</Badge>
        ) : null}
      </div>
    </div>
  );
}
