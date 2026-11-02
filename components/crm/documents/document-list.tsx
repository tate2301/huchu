"use client";

import Link from "next/link";

import { Button, ButtonLink, Empty, Kit, Pill, type PillTone } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { ClientDate } from "@/components/ui/client-date";
import type { SupplierProfileItem } from "@/lib/books/crm-document-bridge";
import { Check, Eye, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import type { CanonicalUiStatus } from "@/lib/ui/status-map";

import { useDocumentActions } from "./document-actions";
import type { DocumentBuilderSheet } from "./document-builder-sheet";
import {
  DOCUMENT_KIND_LABELS,
  documentHref,
  documentNumber,
  documentStatus,
  formatMoney,
  invoiceOutstanding,
  type LeadDocument,
} from "./document-types";

function toPillTone(status: CanonicalUiStatus): PillTone {
  switch (status) {
    case "passing":
      return "ok";
    case "in_progress":
      return "warn";
    case "failing":
      return "bad";
    case "in_review":
      return "info";
    default:
      return "plain";
  }
}

const SUPPLIER_TONE: Record<string, PillTone> = {
  DRAFT: "plain",
  Draft: "plain",
  TO_APPROVE: "warn",
  "To approve": "warn",
  APPROVED: "info",
  Approved: "info",
  SENT: "info",
  PARTIAL: "info",
  "Part paid": "info",
  "To pay": "info",
  Overdue: "warn",
  RECEIVED: "ok",
  PAID: "ok",
  Paid: "ok",
  CLOSED: "ok",
  VOIDED: "plain",
  Void: "plain",
  CANCELLED: "plain",
};

/**
 * What the customer did with it, and what they said.
 */
export function ApprovalFeedback({ approval }: { approval: LeadDocument["approval"] }) {
  if (!approval) return null;

  const declined = approval.status === "DECLINED";
  const approved = approval.status === "APPROVED";
  const who = approval.responderName?.trim();

  if (!approval.respondedAt) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
        <Eye className="size-3.5 shrink-0" aria-hidden="true" />
        {approval.firstViewedAt ? (
          <>
            Opened <ClientDate value={approval.firstViewedAt} />, no answer yet
          </>
        ) : (
          "Sent, not opened yet"
        )}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "mt-1.5 border-l-2 pl-2.5 text-sm",
        declined ? "border-[var(--color-danger)]" : "border-[var(--color-success)]",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 font-medium",
          declined ? "text-[var(--color-danger)]" : "text-[var(--color-success)]",
        )}
      >
        {declined ? (
          <X className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {who ? `${who} ` : ""}
        {declined ? "declined" : approved ? "accepted" : "responded"} this{" "}
        <ClientDate value={approval.respondedAt} />
      </p>
      {approval.responseNote?.trim() ? (
        <p className="mt-0.5 whitespace-pre-wrap text-[var(--color-ink-2)]">
          “{approval.responseNote.trim()}”
        </p>
      ) : null}
    </div>
  );
}

export function DocumentList({
  basePath,
  currency,
  documents,
  canCreate,
  prefillLines,
  onPrefillConsumed,
  heading = "Money on this record",
  booksHref,
  supplierItems = [],
}: {
  /** The record's API base, e.g. /api/v2/crm/deals/<id> or /api/books/crm/<id>. */
  basePath: string;
  currency: string;
  documents: LeadDocument[];
  canCreate: boolean;
  prefillLines?: Parameters<typeof DocumentBuilderSheet>[0]["prefillLines"];
  onPrefillConsumed?: () => void;
  heading?: string;
  booksHref?: string | null;
  supplierItems?: SupplierProfileItem[];
}) {
  const actions = useDocumentActions({ basePath, currency, prefillLines, onPrefillConsumed });

  const quotes = documents.filter((d) => d.type === "QUOTATION");
  const invoices = documents.filter((d) => d.type === "INVOICE" && d.invoice?.status !== "VOIDED");
  const receipts = documents.filter((d) => d.type === "RECEIPT" && !d.receipt?.voidedAt);

  const latestQuote = quotes[0] ?? null;
  const latestInvoice = invoices[0] ?? null;
  const openInvoice = invoices.find((d) => d.invoice && invoiceOutstanding(d.invoice) > 0.005) ?? null;

  const totalQuoted = latestQuote ? latestQuote.amount : 0;
  const totalInvoiced = invoices.reduce((sum, d) => sum + d.amount, 0);
  const totalPaid = receipts.reduce((sum, d) => sum + d.amount, 0);
  const totalOutstanding = invoices.reduce((sum, d) => sum + (d.invoice ? invoiceOutstanding(d.invoice) : 0), 0);

  const quoteState = latestQuote ? documentStatus(latestQuote) : null;
  const invoiceState = latestInvoice ? documentStatus(latestInvoice) : null;

  return (
    <Kit className="sc-bk-a">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Books CRM Money summary block (bk-x-crm-deal .k-money) */}
        <section className="k-money" aria-label={heading}>
          <header>
            <b>{heading}</b>
            <span className="end">
              {canCreate ? (
                <>
                  <Button size="sm" icon="plus" onClick={() => actions.create("quotation")}>
                    New quote
                  </Button>
                  <Button size="sm" icon="plus" onClick={() => actions.create("invoice")}>
                    New invoice
                  </Button>
                  {openInvoice ? (
                    <Button size="sm" variant="primary" icon="payments" onClick={() => actions.openPayment(openInvoice)}>
                      Record payment
                    </Button>
                  ) : null}
                </>
              ) : null}
              {booksHref ? (
                <ButtonLink size="sm" variant="quiet" icon="arrow" href={booksHref}>
                  Open in Books
                </ButtonLink>
              ) : latestInvoice ? (
                <ButtonLink size="sm" variant="quiet" icon="arrow" href={documentHref(latestInvoice)}>
                  Open in Books
                </ButtonLink>
              ) : latestQuote ? (
                <ButtonLink size="sm" variant="quiet" icon="arrow" href={documentHref(latestQuote)}>
                  Open in Books
                </ButtonLink>
              ) : null}
            </span>
          </header>

          {!canCreate && documents.length === 0 ? (
            <div className="k-mrow">
              <span className="muted">Billing</span>
              <span className="muted" style={{ gridColumn: "2 / -1" }}>
                Give this record somebody to bill — a contact name or a company — before quoting or invoicing.
              </span>
            </div>
          ) : null}

          <div className="k-mrow">
            <span className="muted">Quote</span>
            <span>
              {latestQuote ? (
                <>
                  <Link className="ref" href={documentHref(latestQuote)}>
                    {documentNumber(latestQuote)}
                  </Link>
                  {latestQuote.version > 1 ? <span className="muted"> · v{latestQuote.version}</span> : null}
                  {quotes.length > 1 ? <span className="muted"> · {quotes.length} quotes</span> : null}
                </>
              ) : (
                <span className="muted">No quote yet</span>
              )}
            </span>
            <span>
              {quoteState ? (
                <Pill tone={toPillTone(quoteState.status)}>{quoteState.label}</Pill>
              ) : (
                <Pill tone="plain">None</Pill>
              )}
            </span>
            <span className="amt">{latestQuote ? formatMoney(totalQuoted, latestQuote.currency) : formatMoney(0, currency)}</span>
          </div>

          <div className="k-mrow">
            <span className="muted">Invoice</span>
            <span>
              {latestInvoice ? (
                <>
                  <Link className="ref" href={documentHref(latestInvoice)}>
                    {documentNumber(latestInvoice)}
                  </Link>
                  {invoices.length > 1 ? <span className="muted"> · {invoices.length} invoices</span> : null}
                </>
              ) : (
                <span className="muted">No invoice yet</span>
              )}
            </span>
            <span>
              {invoiceState ? (
                <Pill tone={toPillTone(invoiceState.status)}>{invoiceState.label}</Pill>
              ) : (
                <Pill tone="plain">None</Pill>
              )}
            </span>
            <span className="amt">{formatMoney(totalInvoiced, latestInvoice?.currency ?? currency)}</span>
          </div>

          <div className="k-mrow">
            <span className="muted">Paid</span>
            <span>
              {receipts.length > 0 ? (
                <>
                  <Link className="ref" href={documentHref(receipts[0])}>
                    {documentNumber(receipts[0])}
                  </Link>
                  {receipts.length > 1 ? <span className="muted"> · {receipts.length} receipts</span> : null}
                </>
              ) : (
                <span className="muted">No payments recorded</span>
              )}
            </span>
            <span>
              {totalPaid > 0.005 ? (
                <Pill tone={totalOutstanding <= 0.005 && totalInvoiced > 0.005 ? "ok" : "info"}>
                  {totalOutstanding <= 0.005 && totalInvoiced > 0.005 ? "Settled" : "Part paid"}
                </Pill>
              ) : (
                <Pill tone="plain">Unpaid</Pill>
              )}
            </span>
            <span className="amt">{formatMoney(totalPaid, receipts[0]?.currency ?? currency)}</span>
          </div>

          {totalOutstanding > 0.005 ? (
            <div className="k-mrow">
              <span className="muted">Outstanding</span>
              <span className="muted">
                {openInvoice ? `Balance on ${documentNumber(openInvoice)}` : "Balance due"}
              </span>
              <span>
                <Pill tone="warn">Owing</Pill>
              </span>
              <span className="amt">{formatMoney(totalOutstanding, openInvoice?.currency ?? currency)}</span>
            </div>
          ) : null}
        </section>

        {/* Issued Quotes, Invoices & Receipts Table */}
        {documents.length === 0 && supplierItems.length === 0 ? (
          <Empty icon="docs" title="No quotes, invoices, or receipts yet">
            Every quote, invoice, and payment receipt issued for this record appears here and in Books.
          </Empty>
        ) : null}

        {documents.length > 0 ? (
          <div className="kpanel">
            <div className="kpanel-h">
              <h2>Quotes, invoices &amp; receipts</h2>
              <span className="muted" style={{ fontSize: 13 }}>
                {documents.length}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table" aria-label="Quotes, invoices and receipts">
                <colgroup>
                  <col style={{ width: 136 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 110 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 116 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Kind</th>
                    <th>Date</th>
                    <th>Details</th>
                    <th>State</th>
                    <th className="num">Amount</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const status = documentStatus(doc);
                    const outstanding = doc.invoice ? invoiceOutstanding(doc.invoice) : 0;
                    const canPay = doc.type === "INVOICE" && outstanding > 0.005;
                    const pdfUrl = `/api/v2/crm/documents/${doc.id}/pdf`;

                    return (
                      <tr key={doc.id}>
                        <td>
                          <Link className="ref" href={documentHref(doc)}>
                            {documentNumber(doc)}
                          </Link>
                          {doc.version > 1 ? (
                            <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                              v{doc.version}
                            </span>
                          ) : null}
                        </td>
                        <td className="muted">{DOCUMENT_KIND_LABELS[doc.type]}</td>
                        <td className="muted">
                          <ClientDate value={doc.createdAt} mode="date" />
                        </td>
                        <td className="wrap">
                          <span className="cell-lead">
                            {canPay ? (
                              <span className="muted">
                                {formatMoney(outstanding, doc.currency)} outstanding
                              </span>
                            ) : doc.type === "QUOTATION" && doc.quotation ? (
                              <span className="muted">
                                {doc.quotation.validUntil ? (
                                  <>
                                    Valid until <ClientDate value={doc.quotation.validUntil} mode="date" />
                                  </>
                                ) : (
                                  "Sales quotation"
                                )}
                              </span>
                            ) : doc.type === "INVOICE" && doc.invoice ? (
                              <span className="muted">
                                {doc.invoice.dueDate ? (
                                  <>
                                    Due <ClientDate value={doc.invoice.dueDate} mode="date" />
                                  </>
                                ) : (
                                  "Sales invoice"
                                )}
                              </span>
                            ) : doc.type === "RECEIPT" && doc.receipt ? (
                              <span className="muted">{doc.receipt.method}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                            {doc.revisionNote ? (
                              <span className="muted"> · {doc.revisionNote}</span>
                            ) : null}
                          </span>
                          <ApprovalFeedback approval={doc.approval} />
                        </td>
                        <td>
                          <Pill tone={toPillTone(status.status)}>{status.label}</Pill>
                        </td>
                        <td className="num">{formatMoney(doc.amount, doc.currency)}</td>
                        <td className="num">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <ButtonLink
                              variant="quiet"
                              size="sm"
                              iconOnly
                              icon="docs"
                              href={pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`View PDF for ${documentNumber(doc)}`}
                              title="View PDF"
                            />
                            <ButtonLink
                              variant="quiet"
                              size="sm"
                              iconOnly
                              icon="export"
                              href={`${pdfUrl}?download=1`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Download PDF for ${documentNumber(doc)}`}
                              title="Download PDF"
                            />
                            <MenuButton
                              variant="quiet"
                              size="sm"
                              iconOnly
                              icon="more"
                              iconEnd={undefined}
                              align="end"
                              label={`Actions for ${documentNumber(doc)}`}
                              aria-label={`Actions for ${documentNumber(doc)}`}
                              items={actions.menuEntriesFor(doc)}
                            />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Supplier Bills, Orders & Payments when this profile also supplies us */}
        {supplierItems.length > 0 ? (
          <div className="kpanel">
            <div className="kpanel-h">
              <h2>Supplier bills, orders &amp; payments</h2>
              <span className="muted" style={{ fontSize: 13 }}>
                {supplierItems.length}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table" aria-label="Supplier bills, orders and payments">
                <colgroup>
                  <col style={{ width: 136 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 110 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Kind</th>
                    <th>Date</th>
                    <th>Details</th>
                    <th>State</th>
                    <th className="num">Amount</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierItems.map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td>
                        <Link className="ref" href={item.href}>
                          {item.number}
                        </Link>
                      </td>
                      <td className="muted">
                        {item.kind === "BILL"
                          ? "Bill"
                          : item.kind === "PURCHASE_ORDER"
                            ? "Purchase order"
                            : "Supplier payment"}
                      </td>
                      <td className="muted">
                        <ClientDate value={item.date} mode="date" />
                      </td>
                      <td className="muted truncate">{item.detail ?? "—"}</td>
                      <td>
                        <Pill tone={SUPPLIER_TONE[item.status] ?? "plain"}>{item.status}</Pill>
                      </td>
                      <td className="num">{formatMoney(item.amount, item.currency)}</td>
                      <td className="num">
                        {item.balance !== null && item.balance > 0.005 ? (
                          formatMoney(item.balance, item.currency)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {actions.surfaces}
    </Kit>
  );
}
