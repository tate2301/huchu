"use client";

import { Badge } from "@corelithzw/react";

import type {
  SchoolFeeInvoiceRecord,
  SchoolFeeReceiptRecord,
  SchoolFeeRefundRecord,
  SchoolFeeStructureRecord,
  SchoolFeeWaiverRecord,
} from "../../fees-v2";

/**
 * What each fee state looks like, in one place.
 *
 * Five tables were each carrying their own switch over their own enum, and the
 * three that shared a value did not agree on its colour — a voided receipt was
 * destructive, a voided invoice was too, and a rejected waiver was not. The
 * tone rule they now share:
 *
 *   success  money has arrived or the discount is on the bill
 *   brand    live and waiting on somebody
 *   warn     part done, or a decision taken but not acted on
 *   danger   the money is not coming
 *   neutral  a draft — the school still talking to itself
 */

export function InvoiceStatusBadge({ status }: { status: SchoolFeeInvoiceRecord["status"] }) {
  if (status === "PAID") return <Badge tone="success">Paid</Badge>;
  if (status === "PART_PAID") return <Badge tone="warn">Part paid</Badge>;
  if (status === "ISSUED") return <Badge tone="brand">Issued</Badge>;
  if (status === "VOIDED") return <Badge tone="danger">Voided</Badge>;
  if (status === "WRITEOFF") return <Badge tone="danger">Write-off</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}

export function ReceiptStatusBadge({ status }: { status: SchoolFeeReceiptRecord["status"] }) {
  if (status === "POSTED") return <Badge tone="success">Posted</Badge>;
  if (status === "VOIDED") return <Badge tone="danger">Voided</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}

export function WaiverStatusBadge({ status }: { status: SchoolFeeWaiverRecord["status"] }) {
  if (status === "APPLIED") return <Badge tone="success">Applied</Badge>;
  if (status === "APPROVED") return <Badge tone="warn">Approved</Badge>;
  if (status === "REJECTED") return <Badge tone="danger">Rejected</Badge>;
  if (status === "REVERSED") return <Badge tone="danger">Reversed</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}

export function RefundStatusBadge({ status }: { status: SchoolFeeRefundRecord["status"] }) {
  if (status === "PAID") return <Badge tone="success">Paid</Badge>;
  if (status === "CANCELLED") return <Badge tone="danger">Cancelled</Badge>;
  return <Badge tone="brand">Requested</Badge>;
}

export function StructureStatusBadge({
  status,
}: {
  status: SchoolFeeStructureRecord["status"];
}) {
  if (status === "ACTIVE") return <Badge tone="success">Active</Badge>;
  if (status === "ARCHIVED") return <Badge tone="neutral">Archived</Badge>;
  return <Badge tone="warn">Draft</Badge>;
}

/**
 * S-2.7. What ZIMRA has, or why it has nothing.
 *
 * `lib/schools/fiscalisation.ts` had no screen at all: a receipt could sit
 * FAILED for a week and the only place that said so was the database. The
 * number itself is the point — it is what a parent quotes back — so it is the
 * badge's text once there is one.
 */
export function FiscalBadge({
  fiscal,
}: {
  fiscal: SchoolFeeReceiptRecord["fiscalReceipt"];
}) {
  if (!fiscal) {
    return <span className="text-[color:var(--text-muted)]">—</span>;
  }
  if (fiscal.fiscalNumber) {
    return (
      <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)]">
        {fiscal.fiscalNumber}
      </span>
    );
  }
  if (fiscal.status === "FAILED") return <Badge tone="danger">Not sent</Badge>;
  return <Badge tone="warn">Queued</Badge>;
}
