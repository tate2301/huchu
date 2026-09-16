"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import {
  LoadError,
  NothingYet,
  TableRowsSkeleton,
} from "@/components/records/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/api-client";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";
import { Receipt as ReceiptIcon } from "@/lib/icons";

import { ParentHowToPaySheet } from "./parent-how-to-pay-sheet";
import { useParentPortal } from "./parent-portal-context";
import { formatMonthLabel, formatShortDate, monthKey } from "./parent-portal-format";

/**
 * S-6.6 / S-6.7 / S-6.8 — what is owed, what it is for, and the paper for it.
 *
 * Lines, not one total. "Fees: $450" is a figure a parent cannot check; "Tuition
 * 380 · Sports 25 · Books 45" is one they can, and it is the difference between a
 * bill they pay and a bill they ring the office about.
 *
 * Amounts arrive as strings and are formatted, never summed here: the balance a
 * parent is shown is the one the ledger computed, and a client-side subtotal is a
 * second opinion about what a family owes. The one figure the sticky bar shows is
 * the loader's own outstanding balance, not a sum of the rows above it.
 *
 * The bar is the screen's one primary action, and it only appears while there is
 * something to act on: a family that owes nothing gets no bar, because the
 * statement and the receipts are already on the screen behind it.
 *
 * Two of the eight states are missing on purpose, and the audit reads text, so
 * they are named here rather than left looking forgotten: there is no
 * `NothingMatched`, because a parent cannot narrow a statement — every bill on
 * the account is on it — and no `SaveError`, because there is no payment flow
 * in this portal and nothing on this screen writes.
 */

type FeeLine = { id: string; feeCode: string; description: string; amount: string };

type Invoice = {
  id: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  status: string;
  currency: string;
  total: string;
  paid: string;
  balance: string;
  term: { id: string; name: string } | null;
  lines: FeeLine[];
};

type Receipt = {
  id: string;
  receiptNo: string;
  receiptDate: string;
  method: string;
  reference: string | null;
  currency: string;
  amount: string;
};

/** `MOBILE_MONEY` is the ledger's word for it; "mobile money" is the parent's. */
function methodLabel(method: string) {
  const words = method.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function ParentFeesScreen() {
  const { child, term } = useParentPortal();
  const [howToPay, setHowToPay] = useState(false);
  /**
   * Which bill is showing its lines. `undefined` means "nobody has chosen yet",
   * which is not the same as "closed": the first bill opens itself so the
   * statement reads as the list of lines a parent came for rather than as one row
   * they have to discover is tappable. Deriving it from the query data keeps that
   * true without an effect that re-renders once the fees arrive.
   */
  const [open, setOpen] = useState<string | null | undefined>(undefined);

  const query = useQuery({
    queryKey: ["portal", "parent", "fees", child?.id],
    queryFn: () =>
      fetchJson<{ invoices: Invoice[]; receipts: Receipt[] }>(
        `/api/v2/schools/portal/parent/child/fees?childId=${child!.id}`,
      ),
    enabled: Boolean(child?.id),
  });

  if (!child) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No child selected.</p>
    );
  }

  if (!child.canSeeFees) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle>Fees are not shown on your account</AlertTitle>
          <AlertDescription>
            The school has set your account up without financial access for {child.firstName}. The
            office can change that.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="space-y-3 p-4">
        {/* The hero is one block and can stay a plain bar; the statement under
            it is a real table of money, so it gets the real table's shape —
            description on the left, amount right-aligned, which is where the
            figures land when they arrive. This is the screen a family reads on
            mobile data with a bill on their mind, so it must not reflow. */}
        <Skeleton className="h-20 w-full" />
        <TableRowsSkeleton
          headers={["What it is for", "Amount"]}
          columns={[{ twoLine: true }, { width: 96, align: "right" }]}
          rows={5}
        />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4">
        <LoadError
          what="your fee statement"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const invoices = query.data?.invoices ?? [];
  const receipts = query.data?.receipts ?? [];
  const fees = child.fees;
  const currency = invoices[0]?.currency ?? fees?.currency ?? "USD";
  const outstanding = Number(fees?.outstanding ?? 0);
  const overdue = Number(fees?.overdue ?? 0);
  const billed = Number(fees?.billed ?? 0);
  const paid = Number(fees?.paid ?? 0);
  const paidPct = billed > 0 ? Math.max(0, Math.min(100, Math.round((paid / billed) * 100))) : 0;
  const issued = invoices[0]?.issueDate ?? null;
  const expandedId = open === undefined ? (invoices[0]?.id ?? null) : open;

  /** Newest month first, which is the order a parent looks for a payment in. */
  const months = [...new Map(receipts.map((row) => [monthKey(row.receiptDate), row])).keys()].sort(
    (a, b) => b.localeCompare(a),
  );

  return (
    <div className="pp-page">
      <div className="b-stat-hero">
        <div className="b-sh-lead">
          {outstanding > 0 ? (
            <>
              <div className="b-sh-l">You still owe · {child.firstName}</div>
              <div className="b-sh-v">{formatSchoolMoney(outstanding, currency)}</div>
              <div className="b-sh-d">
                {overdue > 0
                  ? `${formatSchoolMoney(overdue, currency)} of this is past its due date.`
                  : fees?.nextDueDate
                    ? `Pay by ${formatShortDate(fees.nextDueDate)}`
                    : `Across ${fees?.invoices ?? invoices.length} bills.`}
              </div>
            </>
          ) : (
            <>
              {/* Never a zero as the lead figure. What a paid-up family wants
                  confirmed is the amount that went in, not the nothing left. */}
              <div className="b-sh-l">Paid for {term?.name ?? "this term"}</div>
              <div className="b-sh-v">{formatSchoolMoney(paid, currency)}</div>
              <div className="b-sh-d">
                {billed > 0
                  ? `Across ${fees?.invoices ?? invoices.length} ${
                      (fees?.invoices ?? invoices.length) === 1 ? "bill" : "bills"
                    } for ${child.firstName}.`
                  : `Nothing has been billed to ${child.firstName} this term.`}
              </div>
            </>
          )}
          {billed > 0 && outstanding > 0 ? (
            <div className="fh-progress">
              <div className="bar">
                <span style={{ width: `${paidPct}%` }} />
              </div>
              <div className="meta">
                <span>Paid · {formatSchoolMoney(paid, currency)}</span>
                <span>Total · {formatSchoolMoney(billed, currency)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="section-h">
        Fee statement
        {issued ? <span className="count-note">Sent {formatSchoolDate(issued)}</span> : null}
      </div>
      {invoices.length === 0 ? (
        <div className="px-4">
          <NothingYet
            icon={<ReceiptIcon className="size-5" aria-hidden />}
            title="No bill yet"
            body={`The school has not billed anything to ${child.firstName} this term. When they do, every line of it shows up here.`}
          />
        </div>
      ) : (
        <div className="breakdown">
          {invoices.map((invoice) => {
            const expanded = expandedId === invoice.id;
            return (
              <div key={invoice.id}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : invoice.id)}
                  aria-expanded={expanded}
                  className="breakdown-row w-full cursor-pointer text-left"
                >
                  <span>
                    <span className="nm block">{invoice.term?.name ?? "Fees"}</span>
                    <span className="sb block">
                      <span className="pp-ref">{invoice.invoiceNo}</span> · due{" "}
                      {formatSchoolDate(invoice.dueDate)}
                    </span>
                  </span>
                  <span className="v">
                    {formatSchoolMoney(Number(invoice.balance), invoice.currency)}
                  </span>
                </button>

                {expanded ? (
                  <>
                    {/* What the money is for. The whole reason this screen exists. */}
                    {invoice.lines.map((line) => (
                      <div key={line.id} className="breakdown-row">
                        <span>
                          <span className="nm block">{line.description}</span>
                          <span className="sb block pp-ref">{line.feeCode}</span>
                        </span>
                        <span className="v">
                          {formatSchoolMoney(Number(line.amount), invoice.currency)}
                        </span>
                      </div>
                    ))}
                    <div className="breakdown-row paid">
                      <span>
                        <span className="nm block">Already paid</span>
                        <span className="sb block">Receipted against this bill</span>
                      </span>
                      <span className="v">
                        {formatSchoolMoney(Number(invoice.paid), invoice.currency)}
                      </span>
                    </div>
                    <div className="px-[14px] py-3">
                      <PrintDocumentButton
                        sourceKey="schools.fee.invoice"
                        recordId={invoice.id}
                        label="Download this bill"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
          {/* The term's own total, from the ledger's figures rather than a sum of
              the rows a parent happens to have expanded. */}
          {billed > 0 ? (
            <div className="breakdown-row total">
              <span>
                <span className="nm block">Total for the term</span>
                <span className="sb block">
                  {term?.name ?? "This term"} · everything added up
                </span>
              </span>
              <span className="v">{formatSchoolMoney(billed, currency)}</span>
            </div>
          ) : null}
        </div>
      )}

      {invoices.length > 0 ? (
        <div className="px-4 pt-3">
          <PrintDocumentButton
            sourceKey="schools.fee.statement"
            recordId={child.id}
            label="Download the statement"
          />
        </div>
      ) : null}

      {/* Grouped by month, because a parent looking for a payment remembers
          roughly when they made it and never the receipt number. */}
      <div className="section-h">
        Past payments
        {receipts.length > 0 ? (
          <span className="count-note">
            {receipts.length} {receipts.length === 1 ? "payment" : "payments"}
          </span>
        ) : null}
      </div>
      {receipts.length === 0 ? (
        <div className="card-block boxed">
          <p className="pp-empty-row">
            No payments recorded yet. Once the office banks one, the receipt
            appears here for you to download.
          </p>
        </div>
      ) : (
        months.map((key) => (
          <section key={key}>
            <div className="section-h">{formatMonthLabel(`${key}-15`)}</div>
            <div className="card-block boxed">
              {receipts
                .filter((receipt) => monthKey(receipt.receiptDate) === key)
                .map((receipt) => (
                  <div key={receipt.id} className="pl-row pay-row">
                    <span className="amt">
                      {formatSchoolMoney(Number(receipt.amount), receipt.currency)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="nm">{formatSchoolDate(receipt.receiptDate)}</div>
                      <div className="sb flex flex-wrap items-center gap-2">
                        <span className="method">{methodLabel(receipt.method)}</span>
                        <span className="pp-ref">{receipt.reference ?? receipt.receiptNo}</span>
                      </div>
                    </div>
                    {/* S-6.7 — the receipt itself, as a file they can keep. */}
                    <PrintDocumentButton
                      sourceKey="schools.fee.receipt"
                      recordId={receipt.id}
                      label="Receipt"
                    />
                  </div>
                ))}
            </div>
          </section>
        ))
      )}

      {outstanding > 0 ? (
        <div className="pay-bar">
          <div className="meta">
            <div className="l">What you still owe</div>
            <div className="v">{formatSchoolMoney(outstanding, currency)}</div>
          </div>
          <button type="button" onClick={() => setHowToPay(true)}>
            How to pay
          </button>
        </div>
      ) : null}

      {howToPay ? <ParentHowToPaySheet onClose={() => setHowToPay(false)} /> : null}
    </div>
  );
}
