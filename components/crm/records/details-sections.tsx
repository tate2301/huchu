"use client";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { RailSection } from "@/components/records/record-page-shell";
import {
  documentNumber,
  documentStatus,
  formatMoney,
  invoiceOutstanding,
  type LeadDocument,
} from "@/components/crm/documents/document-types";
import { Bell, ChevronRight, FileText, Payments, Plus, Receipt, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

const DOC_LABEL: Record<string, string> = {
  QUOTATION: "Quotation",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
};

const DOC_ICON: Record<string, LucideIcon> = {
  QUOTATION: FileText,
  INVOICE: Receipt,
  RECEIPT: Payments,
};

function dueLabel(iso: string | null) {
  if (!iso) return null;
  const due = new Date(iso);
  const today = new Date();
  const days = Math.round(
    (Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
      86_400_000,
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  return due.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * What the record is owed, and the paper behind it.
 *
 * The figure first — what is still outstanding — then a bar for how much of
 * what was invoiced has come in, then each live quote and invoice as a row that
 * opens it in Money. The verbs under it are the two things somebody does about
 * an unpaid invoice: take the payment, or remind the customer.
 */
export function BillingSection({
  documents,
  currency,
  onOpen,
  onRecordPayment,
  onRemind,
  onQuote,
}: {
  documents: LeadDocument[];
  currency: string;
  /** Open Money, at this document if one is named. */
  onOpen: (doc?: LeadDocument) => void;
  onRecordPayment: (doc: LeadDocument) => void;
  onRemind: (doc: LeadDocument) => void;
  /** Start a quotation, when there is nothing billed yet. */
  onQuote?: () => void;
}) {
  const live = documents.filter(
    (doc) =>
      (doc.type === "QUOTATION" && !documents.some((other) => other.supersedesId === doc.id)) ||
      (doc.type === "INVOICE" && doc.invoice?.status !== "VOIDED"),
  );
  const invoices = live.filter((doc) => doc.type === "INVOICE" && doc.invoice);
  const invoiced = invoices.reduce((sum, doc) => sum + (doc.invoice?.total ?? 0), 0);
  const outstanding = invoices.reduce(
    (sum, doc) => sum + (doc.invoice ? invoiceOutstanding(doc.invoice) : 0),
    0,
  );
  const open = invoices.find((doc) => doc.invoice && invoiceOutstanding(doc.invoice) > 0.005) ?? null;
  const paidShare = invoiced > 0 ? Math.round(((invoiced - outstanding) / invoiced) * 100) : 0;
  const settled = invoices.length > 0 && outstanding <= 0.005;

  if (live.length === 0) {
    return (
      <RailSection title="Billing">
        <p className="text-sm text-[var(--color-ink-3)]">Nothing quoted or invoiced yet.</p>
        {onQuote ? (
          <Button size="sm" variant="secondary" className="mt-3" onClick={onQuote}>
            <Plus className="size-4" aria-hidden="true" />
            New quotation
          </Button>
        ) : null}
      </RailSection>
    );
  }

  return (
    <RailSection
      title="Billing"
      action={
        invoices.length > 0 ? (
          <StatusChip
            status={settled ? "passing" : "need_changes"}
            label={settled ? "Paid" : "Unpaid"}
          />
        ) : null
      }
    >
      {invoices.length > 0 ? (
        <>
          <div className="rec-bl-top">
            <span className={cn("rec-bl-fig", settled && "is-paid")}>
              {formatMoney(settled ? invoiced : outstanding, currency)}
            </span>
            <span className="rec-bl-sub">{settled ? "paid in full" : "outstanding"}</span>
          </div>
          <div
            className="rec-bl-bar"
            role="meter"
            aria-label="Paid"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={paidShare}
          >
            <i style={{ width: `${paidShare}%` }} />
          </div>
          <div className="rec-bl-meta">
            <span>
              Paid <b>{paidShare}%</b>
            </span>
            {open?.invoice?.dueDate ? (
              <span>
                Due <b>{dueLabel(open.invoice.dueDate)}</b>
              </span>
            ) : settled ? (
              <span>Settled</span>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="rec-bl-docs">
        {live.map((doc) => {
          const Icon = DOC_ICON[doc.type] ?? FileText;
          const status = documentStatus(doc);
          return (
            <button
              key={doc.id}
              type="button"
              className="rec-bl-r"
              onClick={() => onOpen(doc)}
              title={`Open ${documentNumber(doc)} in Money`}
            >
              <Icon className="rec-bl-r-i" aria-hidden="true" />
              <span className="rec-bl-r-g">
                <b>{documentNumber(doc)}</b>
                <span>{DOC_LABEL[doc.type] ?? doc.type}</span>
              </span>
              <StatusChip status={status.status} label={status.label} />
              <span className="rec-bl-r-a">{formatMoney(doc.amount, doc.currency)}</span>
              <ChevronRight className="rec-bl-r-c" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {open ? (
        <div className="rec-bl-a">
          <Button variant="primary" onClick={() => onRecordPayment(open)}>
            <Payments className="size-4" aria-hidden="true" />
            Record payment
          </Button>
          <Button variant="secondary" onClick={() => onRemind(open)}>
            <Bell className="size-4" aria-hidden="true" />
            Remind
          </Button>
        </div>
      ) : null}
    </RailSection>
  );
}

export type ContactCount = {
  key: string;
  label: string;
  value: number;
  /** Log another of these — opens the composer on that channel. */
  onLog: () => void;
};

/**
 * How much contact there has been, as three cells you can press to add one.
 *
 * The count is the answer to "has anybody actually rung them", and pressing
 * the cell is the obvious next move when the answer is no.
 */
export function ContactCounts({ counts }: { counts: ContactCount[] }) {
  const total = counts.reduce((sum, count) => sum + count.value, 0);
  return (
    <RailSection title="Contact so far" meta={`${total} logged`}>
      <div className="rec-cs">
        {counts.map((count) => (
          <button
            key={count.key}
            type="button"
            className="rec-csb"
            onClick={count.onLog}
            title={`Log ${count.label.toLowerCase().replace(/s$/, "")}`}
          >
            <span className="rec-csb-n">{count.value}</span>
            <span className="rec-csb-l">{count.label}</span>
            <Plus className="rec-csb-p" aria-hidden="true" />
          </button>
        ))}
      </div>
    </RailSection>
  );
}
