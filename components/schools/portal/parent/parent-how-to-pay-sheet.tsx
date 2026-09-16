"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { formatSchoolMoney } from "@/lib/schools/format";
import { X } from "@/lib/icons";

import { useParentPortal } from "./parent-portal-context";
import { formatShortDate } from "./parent-portal-format";

/**
 * What a parent has to know to hand the school money.
 *
 * There is no gateway in this portal yet, and a "Pay now" button that opens
 * nothing is worse than no button. What a family actually needs to pay a
 * Zimbabwean school is a figure, a date and a reference to quote — the office
 * matches the deposit on that reference — so that is what this sheet is.
 *
 * The reference is the invoice number rather than the pupil's name, because two
 * children in one school share a surname and a bank narration is 30 characters.
 * The bank and mobile-money details that belong beside it are not on the tenant
 * record the portal can read; until they are, this shows what it can stand
 * behind rather than a blank labelled "Bank".
 */
type Invoice = {
  id: string;
  invoiceNo: string;
  dueDate: string;
  currency: string;
  balance: string;
};

export function ParentHowToPaySheet({ onClose }: { onClose: () => void }) {
  const { child, term } = useParentPortal();

  const query = useQuery({
    queryKey: ["portal", "parent", "fees", child?.id],
    queryFn: () =>
      fetchJson<{ invoices: Invoice[] }>(
        `/api/v2/schools/portal/parent/child/fees?childId=${child!.id}`,
      ),
    enabled: Boolean(child?.id),
  });

  const fees = child?.fees ?? null;
  const currency = fees?.currency ?? "USD";
  const outstanding = Number(fees?.outstanding ?? 0);
  // The oldest bill still carrying a balance: the one the office is chasing, and
  // so the one whose number a parent should quote.
  const owing = (query.data?.invoices ?? [])
    .filter((invoice) => Number(invoice.balance) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <div className="x-bs-scrim open pp-scrim" role="presentation" onClick={onClose}>
      <div
        className="x-bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="How to pay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="x-bs-grab" />
        <div className="x-bs-head">
          <h3>How to pay</h3>
          <button type="button" className="x-bs-close" aria-label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="x-bs-body">
          <p className="sheet-lede">
            Pay at the school office, or send it from your bank or your phone. Quote the
            reference so the office knows which child it is for.
          </p>
          <dl className="sheet-defs">
            <dt>Amount</dt>
            <dd className="sheet-figure">{formatSchoolMoney(outstanding, currency)}</dd>
            {fees?.nextDueDate ? (
              <>
                <dt>Pay by</dt>
                <dd>{formatShortDate(fees.nextDueDate)}</dd>
              </>
            ) : null}
            {owing ? (
              <>
                <dt>Reference</dt>
                <dd className="pp-ref">{owing.invoiceNo}</dd>
              </>
            ) : null}
            {child ? (
              <>
                <dt>Pupil</dt>
                <dd>
                  {child.firstName} {child.lastName}
                  <span className="pp-ref"> · {child.studentNo}</span>
                </dd>
              </>
            ) : null}
            {term ? (
              <>
                <dt>Term</dt>
                <dd>{term.name}</dd>
              </>
            ) : null}
          </dl>
          <div className="sheet-actions">
            <Link href="/portal/parent/messages" className="pp-wide-btn" onClick={onClose}>
              Ask the office
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
