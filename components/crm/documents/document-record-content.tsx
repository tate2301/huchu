"use client";

/**
 * One quote, invoice or receipt, on a page of its own.
 *
 * A document used to be a row in a deal's list and nothing more: to see what
 * an invoice was for, who had paid what against it and whether anybody had
 * rung about it, you opened its deal, found the row, and opened its PDF. The
 * Collections list and the registers had nowhere to send you. This is where
 * they send you now.
 *
 * The page is built from what the document is to the person reading it. A
 * quote: its lines, and what the client did with it. An invoice: its lines,
 * what has been paid, and the chasing. A receipt: what it paid and what that
 * left owing. Its verbs are the deal's verbs — the same hook decides what may
 * be done and does it — so a quote is emailed, converted or revised the same
 * way from either place. The one move that matters most for where the
 * document stands is the button in the bar; the rest wait in the menu.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, Button, Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnText,
  FactList,
  SectionAction,
  SectionHeading,
  StatusDot,
  type StatusTone,
} from "@/components/management/ui";
import { ChaseDialog, type ChaseTarget } from "@/components/crm/collections/chase-dialog";
import { formatDate, formatMoney } from "@/components/crm/money/money";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import {
  RecordPageShell,
  RecordRelated,
  type RecordAction,
  type RecordTab,
} from "@/components/records/record-page-shell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { COLLECTION_OUTCOME_LABELS } from "@/lib/crm/collections";
import {
  Calendar,
  CalendarCheck,
  Buildings,
  ChatCircle,
  FileText,
  Funnel,
  GitCompare,
  Lock,
  Mail,
  Money,
  Paperclip,
  Payments,
  Phone,
  Plus,
  ReceiptLong,
  Tag,
  User,
  Work,
} from "@/lib/icons";
import type { CanonicalUiStatus } from "@/lib/ui/status-map";

import { useDocumentActions, type DocumentVerb } from "./document-actions";
import { ApprovalFeedback } from "./document-list";
import {
  documentEditLock,
  documentHref,
  documentNumber,
  documentStatus,
  invoiceOutstanding,
  type CrmDocumentKind,
  type LeadDocument,
} from "./document-types";

type Person = { id: string; name: string | null } | null;

/** Another document in the chain, named well enough to link to. */
type Sibling = {
  id: string;
  type: CrmDocumentKind;
  version: number;
  number: string | null;
  status: string | null;
};

type Detail = {
  customer: { id: string; name: string; email: string | null } | null;
  issuedAt: string;
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  subTotal: number | null;
  taxTotal: number | null;
  total: number;
  notes: string | null;
  reference: string | null;
  createdBy: Person;
  lead: { id: string; leadNo: string; title: string | null } | null;
  deal: { id: string; dealNo: string; title: string } | null;
  project: { id: string; projectNo: string; name: string } | null;
  payments: Array<{
    id: string;
    documentId: string | null;
    receiptNumber: string;
    receivedAt: string;
    amount: number;
    method: string;
    reference: string | null;
  }>;
  credits: Array<{ id: string; noteNumber: string; noteDate: string; total: number; reason: string | null }>;
  chases: Array<{
    id: string;
    outcome: keyof typeof COLLECTION_OUTCOME_LABELS;
    promisedAt: string | null;
    promisedAmount: number | null;
    notes: string | null;
    createdAt: string;
    createdBy: Person;
  }>;
  resources: Array<{
    id: string;
    title: string;
    description: string | null;
    kind: "LINK" | "FILE";
    url: string;
  }>;
  supersedes: Sibling | null;
  supersededBy: Array<Sibling | null>;
  raisedFrom: Sibling | null;
  invoicedAs: Sibling[];
  paidInvoice: Sibling | null;
  paidInvoiceBalance: { total: number; paid: number; credited: number; writtenOff: number } | null;
};

type DocumentResponse = { document: LeadDocument; detail: Detail; basePath: string | null };

const KIND: Record<CrmDocumentKind, { list: string; href: string; icon: typeof FileText }> = {
  QUOTATION: { list: "Quotes", href: "/crm/quotes", icon: FileText },
  INVOICE: { list: "Invoices", href: "/crm/invoices", icon: ReceiptLong },
  RECEIPT: { list: "Receipts", href: "/crm/receipts", icon: Money },
};

/** The section's measure, and the line its verb sits on. */
const SECTION_WIDTH = 760;

/** The design has four inks for a state; the document statuses map onto them. */
const TONE: Record<CanonicalUiStatus, StatusTone> = {
  passing: "success",
  failing: "danger",
  need_changes: "warn",
  in_review: "warn",
  in_progress: "warn",
  pending: "neutral",
  inactive: "neutral",
};

/** The states that leave the path, and so earn a chip in the band (rule 5). */
const BAND_EXCEPTIONS = new Set(["Declined", "Voided", "Expired", "Overdue"]);

const money = (amount: number, currency: string) => formatMoney(amount, currency);

function siblingLabel(sibling: Sibling): string {
  const number = sibling.number ?? "Untitled";
  return sibling.version > 1 ? `${number} (v${sibling.version})` : number;
}

function SiblingLink({ sibling }: { sibling: Sibling }) {
  return <EntityLink href={documentHref(sibling)}>{siblingLabel(sibling)}</EntityLink>;
}

/** "CASH" as the cost tracker stores it, "Cash" as the payment dialog does: said the same way. */
function methodLabel(method: string): string {
  if (!/^[A-Z_]+$/.test(method)) return method;
  const words = method.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What the client has done with a quote or invoice they were sent, in a few words. */
function approvalSummary(approval: LeadDocument["approval"]): string | null {
  if (!approval) return null;
  if (approval.status === "APPROVED") {
    return approval.respondedAt ? `Accepted ${formatDate(approval.respondedAt)}` : "Accepted";
  }
  if (approval.status === "DECLINED") {
    return approval.respondedAt ? `Declined ${formatDate(approval.respondedAt)}` : "Declined";
  }
  return approval.firstViewedAt
    ? `Opened ${formatDate(approval.firstViewedAt)}, no answer yet`
    : "Sent, not opened yet";
}

export function DocumentRecordContent({
  documentId,
  kind,
}: {
  documentId: string;
  /** Which list the page was opened under; a document of another kind is sent to its own. */
  kind: CrmDocumentKind;
}) {
  const query = useQuery({
    queryKey: ["crm", "documents", "record", documentId],
    queryFn: () => fetchJson<DocumentResponse>(`/api/v2/crm/documents/${documentId}`),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={240} />
      </div>
    );
  }

  const noun = KIND[kind].list.toLowerCase().replace(/s$/, "");
  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title={`This ${noun} could not be found`}>
        {query.error ? getApiErrorMessage(query.error) : "It may have been removed."}
      </Alert>
    );
  }

  if (query.data.document.type !== kind) {
    // A link that named the wrong kind still reaches the document; it just
    // says which list it belongs to.
    return (
      <Alert tone="info" title={`This is a ${KIND[query.data.document.type].list.toLowerCase().replace(/s$/, "")}`}>
        <a className="underline" href={documentHref(query.data.document)}>
          Open it under {KIND[query.data.document.type].list}
        </a>
      </Alert>
    );
  }

  return <DocumentRecord data={query.data} />;
}

function DocumentRecord({ data }: { data: DocumentResponse }) {
  const { document: doc, detail, basePath } = data;
  const [tab, setTab] = useState("lines");
  const [chasing, setChasing] = useState<ChaseTarget | null>(null);
  const actions = useDocumentActions({ basePath: basePath ?? "", currency: doc.currency });

  const kind = KIND[doc.type];
  const number = documentNumber(doc);
  const status = documentStatus(doc);
  const outstanding = doc.invoice ? invoiceOutstanding(doc.invoice) : 0;
  const editLock = doc.type === "RECEIPT" ? null : documentEditLock(doc);
  const owedBy = detail.customer?.name ?? detail.deal?.title ?? detail.lead?.title ?? null;
  const chaseTarget: ChaseTarget = { documentId: doc.id, invoiceNumber: number, owedBy };

  // Every verb lives under the record the document was raised against. A
  // document hanging off neither has nothing to act through, so it is read
  // only rather than a page of buttons that fail.
  const verbs: DocumentVerb[] = basePath ? actions.verbsFor(doc) : [];
  const verb = (id: DocumentVerb["id"]) => verbs.find((candidate) => candidate.id === id && !candidate.refusal);

  const run = (chosen: DocumentVerb) => {
    if (chosen.onSelect) return chosen.onSelect();
    if (!chosen.href) return;
    if (chosen.newTab) window.open(chosen.href, "_blank", "noopener");
    else window.location.assign(chosen.href);
  };

  // The one move that matters most for where this document stands.
  const accepted = status.label === "Accepted";
  const primary: { verb: DocumentVerb; label: string } | null = (() => {
    if (doc.type === "QUOTATION") {
      const convert = verb("convert");
      if (accepted && convert) return { verb: convert, label: convert.label };
      const email = verb("email");
      if (email && !BAND_EXCEPTIONS.has(status.label) && !accepted) return { verb: email, label: email.label };
    }
    if (doc.type === "INVOICE") {
      const pay = verb("part-payment");
      if (pay) return { verb: pay, label: "Record a payment" };
    }
    const view = verb("view");
    return view ? { verb: view, label: view.label } : null;
  })();

  const menu: RecordAction[] = [
    ...verbs
      .filter((candidate) => !candidate.refusal && candidate.id !== primary?.verb.id)
      .map((candidate) => {
        const Icon = candidate.icon;
        return {
          label: candidate.label,
          icon: <Icon className="size-4" />,
          destructive: candidate.tone === "destructive",
          onSelect: () => run(candidate),
        };
      }),
    ...(doc.type === "INVOICE" && outstanding > 0
      ? [{ label: "Log a chase", icon: <Phone className="size-4" />, onSelect: () => setChasing(chaseTarget) }]
      : []),
  ];

  const recordLink = detail.deal
    ? { href: `/crm/deals/${detail.deal.id}`, label: detail.deal.title, kind: "Deal" }
    : detail.lead
      ? { href: `/crm/leads/${detail.lead.id}`, label: detail.lead.title ?? detail.lead.leadNo, kind: "Lead" }
      : null;

  const due = doc.invoice?.dueDate ?? null;
  const late = status.label === "Overdue";

  // Every property the document has, by name; which of them lead depends on
  // the kind. The first five are what the pane shows before "more", so each
  // kind puts first what its reader opened it for: an invoice's due date, a
  // quote's answer from the client, the invoice a receipt paid.
  const property: Record<string, RecordAttribute | null> = {
    status:
      doc.type === "RECEIPT"
        ? null
        : {
            id: "status",
            label: "Status",
            icon: Tag,
            display: <StatusDot tone={TONE[status.status]} label={status.label} />,
          },
    customer: {
      id: "customer",
      label: "Customer",
      icon: Buildings,
      tone: "strong",
      value: detail.customer?.name ?? null,
      placeholder: "No customer on record",
    },
    email: detail.customer?.email
      ? { id: "email", label: "Email", icon: Mail, value: detail.customer.email }
      : null,
    record: recordLink
      ? {
          id: "record",
          label: recordLink.kind,
          icon: Funnel,
          display: <EntityLink href={recordLink.href}>{recordLink.label}</EntityLink>,
        }
      : null,
    project: detail.project
      ? {
          id: "project",
          label: "Project",
          icon: Work,
          display: <EntityLink href={`/crm/projects/${detail.project.id}`}>{detail.project.name}</EntityLink>,
        }
      : null,
    issued: {
      id: "issued",
      label: doc.type === "RECEIPT" ? "Received" : "Issued",
      icon: Calendar,
      tone: "code",
      value: formatDate(detail.issuedAt),
    },
    valid:
      doc.type === "QUOTATION" && doc.quotation?.validUntil
        ? {
            id: "valid",
            label: "Valid until",
            icon: CalendarCheck,
            tone: "code",
            value: formatDate(doc.quotation.validUntil),
          }
        : null,
    due:
      doc.type === "INVOICE" && due
        ? { id: "due", label: "Due", icon: CalendarCheck, tone: late ? "alert" : "code", value: formatDate(due) }
        : null,
    method: doc.receipt ? { id: "method", label: "Method", icon: Payments, value: methodLabel(doc.receipt.method) } : null,
    reference: detail.reference
      ? { id: "reference", label: "Reference", icon: Tag, tone: "code", value: detail.reference }
      : null,
    approval: approvalSummary(doc.approval)
      ? { id: "approval", label: "Client", icon: ChatCircle, value: approvalSummary(doc.approval) }
      : null,
    replaces: detail.supersedes
      ? {
          id: "replaces",
          label: "Replaces",
          icon: GitCompare,
          display: <SiblingLink sibling={detail.supersedes} />,
        }
      : null,
    raisedFrom: detail.raisedFrom
      ? {
          id: "raised-from",
          label: "Raised from",
          icon: FileText,
          display: <SiblingLink sibling={detail.raisedFrom} />,
        }
      : null,
    pays: detail.paidInvoice
      ? { id: "pays", label: "Pays", icon: ReceiptLong, display: <SiblingLink sibling={detail.paidInvoice} /> }
      : null,
    raisedBy: {
      id: "raised-by",
      label: doc.type === "RECEIPT" ? "Recorded by" : "Raised by",
      icon: User,
      value: detail.createdBy?.name ?? null,
      placeholder: "Not recorded",
    },
    // Why an invoice cannot be changed, where its status does not say so.
    lock:
      editLock && doc.type === "INVOICE"
        ? { id: "lock", label: "Changes", icon: Lock, tone: "muted", value: editLock }
        : null,
  };

  // What a quote became, and what replaced it, can be more than one thing.
  const invoicedAs: RecordAttribute[] = detail.invoicedAs.map((sibling) => ({
    id: `invoiced-${sibling.id}`,
    label: "Invoiced as",
    icon: ReceiptLong,
    display: <SiblingLink sibling={sibling} />,
  }));
  const replacedBy = detail.supersededBy.filter((sibling): sibling is Sibling => sibling !== null);

  const ORDER: Record<CrmDocumentKind, string[]> = {
    QUOTATION: ["status", "customer", "approval", "valid", "record", "project", "issued", "replaces", "email", "raisedBy"],
    INVOICE: ["status", "customer", "due", "record", "project", "issued", "raisedFrom", "email", "raisedBy", "lock"],
    RECEIPT: ["customer", "pays", "issued", "method", "reference", "record", "project", "email", "raisedBy"],
  };
  const attributes: RecordAttribute[] = [
    ...ORDER[doc.type].map((name) => property[name]).filter((row): row is RecordAttribute => Boolean(row)),
    ...invoicedAs,
  ];

  const lines = (
    <>
      {/* An old version's one important fact is that it is old. */}
      {replacedBy.length > 0 ? (
        <Alert tone="info" title="There is a newer version" className="mb-4">
          Replaced by{" "}
          {replacedBy.map((sibling, index) => (
            <span key={sibling.id}>
              {index > 0 ? ", " : null}
              <EntityLink href={documentHref(sibling)}>{siblingLabel(sibling)}</EntityLink>
            </span>
          ))}
          .
        </Alert>
      ) : null}

      {doc.approval?.respondedAt || doc.approval?.responseNote ? (
        <div className="mb-2" style={{ maxWidth: SECTION_WIDTH }}>
          <ApprovalFeedback approval={doc.approval} />
        </div>
      ) : null}

      <section aria-labelledby="document-lines">
        <SectionHeading count={detail.lines.length} maxWidth={SECTION_WIDTH}>
          <span id="document-lines">Lines</span>
        </SectionHeading>
        <ColumnList
          label="Lines"
          maxWidth={SECTION_WIDTH}
          empty="No lines on this one."
          columns={[
            { id: "item", label: "Item" },
            { id: "quantity", label: "Qty", align: "end" },
            { id: "price", label: "Unit price", align: "end", hideBelow: "sm" },
            { id: "tax", label: "Tax", align: "end", hideBelow: "md" },
            { id: "amount", label: "Amount", align: "end" },
          ]}
          rows={detail.lines.map((line) => ({
            id: line.id,
            cells: {
              item: <ColumnName name={line.description} />,
              quantity: <ColumnFigure>{line.quantity}</ColumnFigure>,
              price: <ColumnFigure>{money(line.unitPrice, doc.currency)}</ColumnFigure>,
              tax: (
                <ColumnFigure tone={line.taxAmount ? "default" : "muted"}>
                  {line.taxAmount ? money(line.taxAmount, doc.currency) : "—"}
                </ColumnFigure>
              ),
              amount: <ColumnFigure>{money(line.lineTotal, doc.currency)}</ColumnFigure>,
            },
          }))}
        />
        <div className="mt-2 flex justify-end" style={{ maxWidth: SECTION_WIDTH }}>
          <FactList
            align="end"
            maxWidth={360}
            labelWidth={160}
            items={[
              ...(detail.subTotal !== null && detail.taxTotal
                ? [
                    { label: "Subtotal", value: money(detail.subTotal, doc.currency), mono: true },
                    { label: "Tax", value: money(detail.taxTotal, doc.currency), mono: true },
                  ]
                : []),
              { label: "Total", value: money(detail.total, doc.currency), mono: true },
              ...(doc.invoice
                ? [
                    ...(doc.invoice.amountPaid
                      ? [{ label: "Paid", value: money(doc.invoice.amountPaid, doc.currency), mono: true }]
                      : []),
                    ...(doc.invoice.creditTotal
                      ? [{ label: "Credited", value: money(doc.invoice.creditTotal, doc.currency), mono: true }]
                      : []),
                    ...(doc.invoice.writeOffTotal
                      ? [
                          {
                            label: "Written off",
                            value: money(doc.invoice.writeOffTotal, doc.currency),
                            mono: true,
                          },
                        ]
                      : []),
                    {
                      label: "Still owed",
                      value: money(outstanding, doc.currency),
                      mono: true,
                      tone: outstanding > 0 ? (late ? ("danger" as const) : ("warn" as const)) : ("muted" as const),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </section>

      {detail.notes || doc.revisionNote ? (
        <section aria-labelledby="document-notes">
          <SectionHeading maxWidth={SECTION_WIDTH}>
            <span id="document-notes">Notes</span>
          </SectionHeading>
          <div className="space-y-2 text-sm text-[var(--text-strong)]" style={{ maxWidth: SECTION_WIDTH }}>
            {doc.revisionNote ? (
              <p>
                <span className="text-[var(--text-muted)]">What changed in v{doc.version}: </span>
                {doc.revisionNote}
              </p>
            ) : null}
            {detail.notes ? <p className="whitespace-pre-line">{detail.notes}</p> : null}
          </div>
        </section>
      ) : null}
    </>
  );

  const receiptBody = doc.receipt ? (
    <section aria-labelledby="receipt-against">
      <SectionHeading maxWidth={SECTION_WIDTH}>
        <span id="receipt-against">
          {detail.paidInvoice ? `Paid against ${detail.paidInvoice.number ?? "the invoice"}` : "Payment"}
        </span>
      </SectionHeading>
      <FactList
        align="end"
        maxWidth={SECTION_WIDTH}
        labelWidth={200}
        items={[
          { label: "This payment", value: money(doc.receipt.amount, doc.currency), mono: true },
          ...(detail.paidInvoiceBalance
            ? (() => {
                const balance = detail.paidInvoiceBalance;
                const left = Math.max(
                  0,
                  Math.round((balance.total - balance.paid - balance.credited - balance.writtenOff) * 100) / 100,
                );
                return [
                  { label: "Invoice total", value: money(balance.total, doc.currency), mono: true },
                  { label: "Paid so far", value: money(balance.paid, doc.currency), mono: true },
                  {
                    label: "Still owed",
                    value: money(left, doc.currency),
                    mono: true,
                    tone: left > 0 ? ("warn" as const) : ("muted" as const),
                  },
                ];
              })()
            : []),
        ]}
      />
    </section>
  ) : null;

  const payments =
    doc.type === "INVOICE" ? (
      <>
        <section aria-labelledby="invoice-payments">
          <SectionHeading
            count={detail.payments.length}
            maxWidth={SECTION_WIDTH}
            action={
              primary?.verb.id === "part-payment" ? (
                <SectionAction icon={Plus} onClick={() => run(primary.verb)}>
                  Record a payment
                </SectionAction>
              ) : undefined
            }
          >
            <span id="invoice-payments">Payments</span>
          </SectionHeading>
          <ColumnList
            label="Payments"
            maxWidth={SECTION_WIDTH}
            empty="Nothing paid yet."
            columns={[
              { id: "receipt", label: "Receipt" },
              { id: "received", label: "Received" },
              { id: "amount", label: "Amount", align: "end" },
            ]}
            rows={detail.payments.map((payment) => ({
              id: payment.id,
              cells: {
                receipt: (
                  <ColumnName
                    code={payment.receiptNumber}
                    name={methodLabel(payment.method)}
                    meta={payment.reference ?? undefined}
                    href={payment.documentId ? documentHref({ id: payment.documentId, type: "RECEIPT" }) : null}
                  />
                ),
                received: <ColumnFigure tone="muted">{formatDate(payment.receivedAt)}</ColumnFigure>,
                amount: <ColumnFigure>{money(payment.amount, doc.currency)}</ColumnFigure>,
              },
            }))}
            total={
              detail.payments.length > 1
                ? {
                    receipt: "Paid",
                    amount: (
                      <ColumnFigure>
                        {money(
                          detail.payments.reduce((sum, payment) => sum + payment.amount, 0),
                          doc.currency,
                        )}
                      </ColumnFigure>
                    ),
                  }
                : undefined
            }
          />
        </section>

        {detail.credits.length > 0 ? (
          <section aria-labelledby="invoice-credits">
            <SectionHeading count={detail.credits.length} maxWidth={SECTION_WIDTH}>
              <span id="invoice-credits">Credit notes</span>
            </SectionHeading>
            <ColumnList
              label="Credit notes"
              maxWidth={SECTION_WIDTH}
              columns={[
                { id: "note", label: "Credit note" },
                { id: "date", label: "Date" },
                { id: "amount", label: "Amount", align: "end" },
              ]}
              rows={detail.credits.map((credit) => ({
                id: credit.id,
                cells: {
                  note: <ColumnName code={credit.noteNumber} name={credit.reason ?? "Credit"} />,
                  date: <ColumnFigure tone="muted">{formatDate(credit.noteDate)}</ColumnFigure>,
                  amount: <ColumnFigure>{money(credit.total, doc.currency)}</ColumnFigure>,
                },
              }))}
            />
          </section>
        ) : null}
      </>
    ) : null;

  const chases =
    doc.type === "INVOICE" && (outstanding > 0 || detail.chases.length > 0) ? (
      <section aria-labelledby="invoice-chases">
        <SectionHeading
          count={detail.chases.length}
          maxWidth={SECTION_WIDTH}
          action={
            outstanding > 0 ? (
              <SectionAction icon={Plus} onClick={() => setChasing(chaseTarget)}>
                Log a chase
              </SectionAction>
            ) : undefined
          }
        >
          <span id="invoice-chases">Chases</span>
        </SectionHeading>
        <ColumnList
          label="Chases"
          maxWidth={SECTION_WIDTH}
          empty={late ? "Late, and nobody has chased it yet." : "Not chased yet."}
          columns={[
            { id: "what", label: "What happened" },
            { id: "who", label: "Who", hideBelow: "sm" },
            { id: "when", label: "When", align: "end" },
          ]}
          rows={detail.chases.map((chase) => ({
            id: chase.id,
            cells: {
              what: (
                <ColumnName
                  name={
                    chase.outcome === "PROMISED_TO_PAY" && chase.promisedAt
                      ? `Promised to pay by ${formatDate(chase.promisedAt)}`
                      : COLLECTION_OUTCOME_LABELS[chase.outcome]
                  }
                  meta={chase.notes ?? undefined}
                />
              ),
              who: <ColumnText>{chase.createdBy?.name ?? "—"}</ColumnText>,
              when: <ColumnFigure tone="muted">{formatDate(chase.createdAt)}</ColumnFigure>,
            },
          }))}
        />
      </section>
    ) : null;

  const resources =
    detail.resources.length > 0 ? (
      <section aria-labelledby="document-resources">
        <SectionHeading count={detail.resources.length} maxWidth={SECTION_WIDTH}>
          <span id="document-resources">For the client</span>
        </SectionHeading>
        <ColumnList
          label="For the client"
          maxWidth={SECTION_WIDTH}
          columns={[
            { id: "resource", label: "Sent with it" },
            { id: "kind", label: "Kind", align: "end" },
          ]}
          rows={detail.resources.map((resource) => ({
            id: resource.id,
            cells: {
              resource: (
                <ColumnName
                  name={
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-[var(--border)] underline-offset-2 hover:decoration-current"
                    >
                      {resource.title}
                    </a>
                  }
                  meta={resource.description ?? undefined}
                />
              ),
              kind: <ColumnText>{resource.kind === "FILE" ? "File" : "Link"}</ColumnText>,
            },
          }))}
        />
      </section>
    ) : null;

  const tabs: RecordTab[] = [
    {
      value: "lines",
      label: doc.type === "RECEIPT" ? "Payment" : "Lines",
      icon: doc.type === "RECEIPT" ? Payments : FileText,
      count: doc.type === "RECEIPT" ? undefined : detail.lines.length,
      titled: true,
      content: doc.type === "RECEIPT" ? receiptBody : lines,
    },
    {
      value: "payments",
      label: "Payments",
      icon: Payments,
      count: detail.payments.length + detail.credits.length,
      titled: true,
      content: payments,
    },
    {
      value: "chases",
      label: "Chases",
      icon: Phone,
      count: detail.chases.length,
      attention: late && detail.chases.length === 0,
      titled: true,
      content: chases,
    },
    {
      value: "resources",
      label: "For the client",
      icon: Paperclip,
      count: detail.resources.length,
      titled: true,
      content: resources,
    },
  ];

  const bandValue =
    doc.type === "INVOICE" && outstanding > 0
      ? `${money(outstanding, doc.currency)} owed`
      : money(detail.total, doc.currency);

  return (
    <RecordPageShell
      icon={kind.icon}
      backHref={kind.href}
      backLabel={kind.list}
      title={number}
      reference={doc.version > 1 ? `v${doc.version}` : null}
      subtitle={owedBy ?? undefined}
      status={BAND_EXCEPTIONS.has(status.label) ? status : null}
      bandValue={bandValue}
      primaryAction={
        primary ? (
          <Button
            variant={primary.verb.id === "view" ? "secondary" : "primary"}
            onClick={() => run(primary.verb)}
          >
            {primary.label}
          </Button>
        ) : null
      }
      actions={menu.length > 0 ? menu : undefined}
      related={
        <RecordRelated
          items={[
            ...(recordLink ? [{ href: recordLink.href, label: recordLink.label }] : []),
            ...(detail.project
              ? [
                  {
                    href: `/crm/projects/${detail.project.id}`,
                    label: detail.project.name,
                    dot: "bg-[var(--badge-ok-fg)]",
                  },
                ]
              : []),
          ]}
        />
      }
      attributes={<RecordAttributes attributes={attributes} />}
      activeTab={tab}
      onTabChange={setTab}
      tabs={tabs}
    >
      {actions.surfaces}
      <ChaseDialog target={chasing} onOpenChange={(open) => (!open ? setChasing(null) : undefined)} />
    </RecordPageShell>
  );
}
