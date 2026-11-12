import { z } from "zod";
import { docLabel } from "@/lib/books/doc-number";
import { readCustomer } from "@/lib/books/customers";
import { prisma } from "@/lib/prisma";
import {
  DOCUMENT_RESOURCES_SELECT,
  documentResourceLinks,
  resourcesHeading,
} from "@/lib/crm/resources";
import type {
  DocumentLinkBlock,
  ExportTargetType,
  UniversalDocumentPayload,
} from "@/lib/documents/types";
import {
  isSchoolDocumentSourceKey,
  resolveSchoolDocument,
} from "@/lib/documents/schools-sources";
import {
  isHrDocumentSourceKey,
  resolveHrDocumentSource,
} from "@/lib/documents/hr-sources";
import {
  isCrmRegisterSourceKey,
  resolveCrmRegisterSource,
  summarizeCrmRegisterSource,
} from "@/lib/documents/crm-register-sources";

const LIST_COLUMN_KINDS = [
  "text",
  "code",
  "email",
  "phone",
  "relation",
  "date",
  "datetime",
  "number",
  "money",
  "percent",
  "status",
  "boolean",
] as const;

const sourceInputSchema = z.object({
  target: z.enum(["LIST", "RECORD", "DASHBOARD"]),
  sourceKey: z.string().min(1),
  recordId: z.string().uuid().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  /** A list export narrowed to these records — the rows somebody ticked. */
  ids: z.array(z.string().uuid()).min(1).max(500).optional(),
  /** A list export's columns, in order. Absent: the list's own choice. */
  columns: z.array(z.string().trim().min(1).max(80)).min(1).max(80).optional(),
  /** What the export is called — the view it was taken from. */
  title: z.string().trim().min(1).max(200).optional(),
  payload: z
    .object({
      title: z.string().min(1),
      subtitle: z.string().optional(),
      fileName: z.string().optional(),
      meta: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
      list: z
        .object({
          columns: z
            .array(
              z.object({
                key: z.string(),
                label: z.string(),
                kind: z.enum(LIST_COLUMN_KINDS).optional(),
              }),
            )
            .optional(),
          rows: z.array(z.record(z.string(), z.unknown())),
        })
        .optional(),
      record: z
        .object({
          sections: z.array(
            z.object({
              title: z.string(),
              rows: z.array(z.object({ label: z.string(), value: z.string() })),
            }),
          ),
          lines: z.array(z.record(z.string(), z.unknown())).optional(),
          lineColumns: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
        })
        .optional(),
      dashboard: z
        .object({
          metrics: z.array(
            z.object({
              label: z.string(),
              value: z.string(),
              detail: z.string().optional(),
            }),
          ),
          notes: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type SourceResolutionInput = z.infer<typeof sourceInputSchema>;

/**
 * Who the document is being made for. A record's own paper — an invoice, a
 * payslip — does not depend on it; a list export does, because a list is
 * whatever its reader is allowed to see.
 */
export type SourceContext = { actorId: string | null };

export type SourceSummary = Pick<SourceResolution, "targetType" | "documentType" | "sourceKey"> & {
  rowCount: number;
  /** What the rows are, for the sentence that refuses an export too big to make. */
  noun?: { one: string; many: string };
};

export type SourceResolution = {
  targetType: ExportTargetType;
  documentType: "REPORT_TABLE" | "DASHBOARD_PACK" | "SALES_INVOICE" | "SALES_QUOTATION" | "SALES_RECEIPT" | "GENERIC_RECORD";
  sourceKey: string;
  fileName: string;
  payload: UniversalDocumentPayload;
  rowsForCsv?: Array<Record<string, unknown>>;
};

function isoDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "-";
}

function fmtMoney(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtQty(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  return Number.isInteger(num) ? String(num) : num.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

type CustomerParty = {
  name: string;
  contactName?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  vatNumber?: string | null;
};

function customerParty(title: string, customer: CustomerParty) {
  return {
    title,
    lines: [
      customer.name,
      customer.contactName,
      customer.address,
      customer.phone,
      customer.email,
      customer.vatNumber ? `VAT ${customer.vatNumber}` : customer.taxNumber ? `Tax ${customer.taxNumber}` : null,
    ].filter((line): line is string => Boolean(line)),
  };
}

const FINANCIAL_LINE_COLUMNS = [
  { key: "description", label: "Description" },
  { key: "quantity", label: "Qty" },
  { key: "unitPrice", label: "Unit price" },
  { key: "taxRate", label: "Tax" },
  { key: "lineTotal", label: "Amount" },
];

function financialLineRows(
  lines: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; lineTotal: number }>,
) {
  return lines.map((line) => ({
    description: line.description,
    quantity: fmtQty(line.quantity),
    unitPrice: fmtMoney(line.unitPrice),
    taxRate: line.taxRate ? `${line.taxRate}%` : "—",
    lineTotal: fmtMoney(line.lineTotal),
  }));
}

function applyDateFilter(dateField: string, filters: Record<string, string> | undefined) {
  const startDate = filters?.startDate;
  const endDate = filters?.endDate;
  if (!startDate && !endDate) return {};

  const dateFilter: Record<string, Date> = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);
  return { [dateField]: dateFilter };
}

/**
 * The resources a CRM document offered, as the block the PDF prints last.
 *
 * An invoice or quotation raised in Accounting has no CRM document behind it
 * and prints no block. One raised from a deal has exactly one — the unique
 * `(companyId, invoiceId)` on `CrmLeadDocument` — so the first is the only.
 */
function crmResourceBlock(
  documentType: "QUOTATION" | "INVOICE",
  crmDocuments: Array<{ resources: Parameters<typeof documentResourceLinks>[0] }>,
): DocumentLinkBlock | undefined {
  const items = documentResourceLinks(crmDocuments[0]?.resources ?? []);
  return items.length > 0 ? { heading: resourcesHeading(documentType), items } : undefined;
}

async function resolveInvoice(companyId: string, recordId: string): Promise<SourceResolution> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: recordId },
    include: {
      customer: true,
      lines: true,
      crmLeadDocuments: { where: { companyId }, select: { resources: DOCUMENT_RESOURCES_SELECT } },
    },
  });

  if (!invoice || invoice.companyId !== companyId) {
    throw new Error("Invoice not found");
  }

  const lineRows = financialLineRows(invoice.lines);
  const balance = Math.max(
    0,
    invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal,
  );
  const badge =
    invoice.status === "PAID"
      ? { label: "Paid", tone: "positive" as const }
      : invoice.status === "VOIDED"
        ? { label: "Voided", tone: "negative" as const }
        : invoice.status === "DRAFT"
          ? { label: "Draft", tone: "neutral" as const }
          : { label: "Awaiting payment", tone: "warning" as const };

  const totals = [
    { label: "Subtotal", value: `${invoice.currency} ${fmtMoney(invoice.subTotal)}` },
    ...(invoice.taxTotal > 0 ? [{ label: "Tax", value: `${invoice.currency} ${fmtMoney(invoice.taxTotal)}` }] : []),
    { label: "Total", value: `${invoice.currency} ${fmtMoney(invoice.total)}`, emphasis: balance <= 0 },
    ...(invoice.amountPaid > 0
      ? [{ label: "Amount paid", value: `${invoice.currency} ${fmtMoney(invoice.amountPaid)}` }]
      : []),
    ...(invoice.creditTotal > 0
      ? [{ label: "Credits", value: `${invoice.currency} ${fmtMoney(invoice.creditTotal)}` }]
      : []),
    ...(balance > 0 && invoice.status !== "DRAFT"
      ? [{ label: "Balance due", value: `${invoice.currency} ${fmtMoney(balance)}`, emphasis: true }]
      : []),
  ];

  return {
    targetType: "RECORD",
    documentType: "SALES_INVOICE",
    sourceKey: "accounting.sales.invoice",
    fileName: `invoice-${invoice.invoiceNumber}.pdf`,
    payload: {
      title: "Invoice",
      subtitle: docLabel(invoice.invoiceNumber),
      badge,
      meta: [
        { label: "Invoice No.", value: docLabel(invoice.invoiceNumber) },
        { label: "Issue date", value: isoDate(invoice.invoiceDate) },
        { label: "Due date", value: isoDate(invoice.dueDate) },
        { label: "Currency", value: invoice.currency },
      ],
      parties: [customerParty("Bill to", invoice.customer)],
      totals,
      notes: invoice.notes ? [invoice.notes] : [],
      links: crmResourceBlock("INVOICE", invoice.crmLeadDocuments),
      record: {
        sections: [],
        lineColumns: FINANCIAL_LINE_COLUMNS,
        lines: lineRows,
      },
    },
    rowsForCsv: lineRows,
  };
}

async function resolveQuotation(companyId: string, recordId: string): Promise<SourceResolution> {
  const quotation = await prisma.salesQuotation.findUnique({
    where: { id: recordId },
    include: {
      customer: true,
      lines: true,
      crmLeadDocuments: { where: { companyId }, select: { resources: DOCUMENT_RESOURCES_SELECT } },
    },
  });

  if (!quotation || quotation.companyId !== companyId) {
    throw new Error("Quotation not found");
  }

  const lineRows = financialLineRows(quotation.lines);
  const badge =
    quotation.status === "ACCEPTED"
      ? { label: "Accepted", tone: "positive" as const }
      : quotation.status === "EXPIRED" || quotation.status === "VOIDED"
        ? { label: quotation.status === "EXPIRED" ? "Expired" : "Voided", tone: "negative" as const }
        : quotation.status === "SENT"
          ? { label: "Awaiting response", tone: "warning" as const }
          : { label: "Draft", tone: "neutral" as const };

  return {
    targetType: "RECORD",
    documentType: "SALES_QUOTATION",
    sourceKey: "accounting.sales.quotation",
    fileName: `quotation-${quotation.quotationNumber}.pdf`,
    payload: {
      title: "Quotation",
      subtitle: quotation.quotationNumber,
      badge,
      meta: [
        { label: "Quotation No.", value: quotation.quotationNumber },
        { label: "Date", value: isoDate(quotation.quotationDate) },
        { label: "Valid until", value: isoDate(quotation.validUntil) },
        { label: "Currency", value: quotation.currency },
      ],
      parties: [customerParty("Prepared for", quotation.customer)],
      totals: [
        { label: "Subtotal", value: `${quotation.currency} ${fmtMoney(quotation.subTotal)}` },
        ...(quotation.taxTotal > 0
          ? [{ label: "Tax", value: `${quotation.currency} ${fmtMoney(quotation.taxTotal)}` }]
          : []),
        { label: "Total", value: `${quotation.currency} ${fmtMoney(quotation.total)}`, emphasis: true },
      ],
      notes: [
        ...(quotation.notes ? [quotation.notes] : []),
        ...(quotation.validUntil
          ? [`This quotation is valid until ${isoDate(quotation.validUntil)}.`]
          : []),
      ],
      links: crmResourceBlock("QUOTATION", quotation.crmLeadDocuments),
      record: {
        sections: [],
        lineColumns: FINANCIAL_LINE_COLUMNS,
        lines: lineRows,
      },
    },
    rowsForCsv: lineRows,
  };
}

async function resolveReceipt(companyId: string, recordId: string): Promise<SourceResolution> {
  const receipt = await prisma.salesReceipt.findUnique({
    where: { id: recordId },
    include: {
      customer: true,
      invoice: {
        include: {
          customer: true,
        },
      },
      bankAccount: true,
    },
  });

  if (!receipt || receipt.companyId !== companyId) {
    throw new Error("Receipt not found");
  }

  const partyCustomer = receipt.invoice?.customer ?? receipt.customer;
  const currency = receipt.invoice?.currency ?? "USD";
  const rows = [
    {
      receiptNumber: receipt.receiptNumber,
      receivedAt: isoDate(receipt.receivedAt),
      amount: receipt.amount,
      method: receipt.method,
      reference: receipt.reference ?? "",
      invoiceNumber: receipt.invoice?.invoiceNumber ?? "",
      customer: partyCustomer?.name ?? "",
    },
  ];
  const lineRows = [
    {
      description: receipt.invoice
        ? `Payment against invoice ${receipt.invoice.invoiceNumber}`
        : "Payment received on account",
      method: receipt.method,
      reference: receipt.reference ?? "—",
      amount: fmtMoney(receipt.amount),
    },
  ];

  return {
    targetType: "RECORD",
    documentType: "SALES_RECEIPT",
    sourceKey: "accounting.sales.receipt",
    fileName: `receipt-${receipt.receiptNumber}.pdf`,
    payload: {
      title: "Payment receipt",
      subtitle: receipt.receiptNumber,
      // A void receipt (Books → Payments) prints as void, never as money received.
      badge: receipt.voidedAt ? { label: "Void", tone: "negative" as const } : { label: "Payment received", tone: "positive" as const },
      meta: [
        { label: "Receipt No.", value: receipt.receiptNumber },
        { label: "Date", value: isoDate(receipt.receivedAt) },
        { label: "Method", value: receipt.method },
        ...(receipt.bankAccount?.name ? [{ label: "Bank", value: receipt.bankAccount.name }] : []),
      ],
      parties: partyCustomer
        ? [customerParty("Received from", partyCustomer)]
        : [],
      totals: [
        { label: "Amount received", value: `${currency} ${fmtMoney(receipt.amount)}`, emphasis: true },
      ],
      notes: receipt.invoice
        ? [`Thank you for your payment. Applied to invoice ${receipt.invoice.invoiceNumber}.`]
        : ["Thank you for your payment."],
      record: {
        sections: [],
        lineColumns: [
          { key: "description", label: "Description" },
          { key: "method", label: "Method" },
          { key: "reference", label: "Reference" },
          { key: "amount", label: "Amount" },
        ],
        lines: lineRows,
      },
    },
    rowsForCsv: rows,
  };
}

async function resolveCreditNote(companyId: string, recordId: string): Promise<SourceResolution> {
  const note = await prisma.creditNote.findUnique({
    where: { id: recordId },
    include: {
      invoice: { include: { customer: true } },
      lines: true,
    },
  });

  if (!note || note.companyId !== companyId) {
    throw new Error("Credit note not found");
  }

  const currency = note.currency;
  const lineRows = note.lines.map((line) => ({
    description: line.description,
    quantity: fmtQty(line.quantity),
    unitPrice: fmtMoney(line.unitPrice),
    lineTotal: fmtMoney(line.lineTotal),
  }));

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "accounting.sales.credit-note",
    fileName: `credit-note-${note.noteNumber}.pdf`,
    payload: {
      title: "Credit note",
      subtitle: docLabel(note.noteNumber, "credit note"),
      badge:
        note.status === "ISSUED"
          ? { label: "Issued", tone: "positive" }
          : { label: note.status, tone: "neutral" },
      meta: [
        { label: "Credit Note No.", value: docLabel(note.noteNumber, "credit note") },
        { label: "Date", value: isoDate(note.noteDate) },
        { label: "Against invoice", value: note.invoice?.invoiceNumber ?? "—" },
        { label: "Currency", value: currency },
      ],
      parties: note.invoice?.customer ? [customerParty("Credited to", note.invoice.customer)] : [],
      totals: [{ label: "Total credited", value: `${currency} ${fmtMoney(note.total)}`, emphasis: true }],
      notes: note.reason ? [note.reason] : [],
      record: {
        sections: [],
        lineColumns: [
          { key: "description", label: "Description" },
          { key: "quantity", label: "Qty" },
          { key: "unitPrice", label: "Unit price" },
          { key: "lineTotal", label: "Amount" },
        ],
        lines: lineRows,
      },
    },
    rowsForCsv: lineRows,
  };
}

async function resolveCustomerStatement(
  companyId: string,
  recordId: string,
  filters?: Record<string, string>,
): Promise<SourceResolution> {
  const customerView = await readCustomer(prisma, companyId, recordId, {
    from: filters?.from,
    to: filters?.to,
  });

  if (!customerView) {
    throw new Error("Customer not found");
  }

  const { statement, ages, currency, name, contact, tax } = customerView;
  const customerDoc = await prisma.customer.findUnique({
    where: { id: recordId },
    select: { code: true },
  });

  const lineRows: Array<Record<string, unknown>> = [];
  if (statement.opening !== 0) {
    lineRows.push({
      date: statement.from,
      reference: "—",
      detail: "Opening balance",
      invoiced: "—",
      paid: "—",
      balance: fmtMoney(statement.opening),
    });
  }

  for (const line of statement.lines) {
    lineRows.push({
      date: line.date,
      reference: line.document,
      detail: line.detail,
      invoiced: line.invoiced !== null ? fmtMoney(line.invoiced) : "—",
      paid: line.paid !== null ? fmtMoney(line.paid) : "—",
      balance: fmtMoney(line.balance),
    });
  }

  const badge =
    statement.closing > 0.005
      ? { label: "Payment due", tone: "warning" as const }
      : statement.closing < -0.005
        ? { label: "In credit", tone: "positive" as const }
        : { label: "Settled", tone: "neutral" as const };

  const agingNotes = [
    `Aging analysis as at ${statement.to}: Current: ${currency} ${fmtMoney(ages["Not yet due"])}  ·  1–30 days: ${currency} ${fmtMoney(ages["1 to 30 days"])}  ·  31–60 days: ${currency} ${fmtMoney(ages["31 to 60 days"])}  ·  61–90 days: ${currency} ${fmtMoney(ages["61 to 90 days"])}  ·  90+ days: ${currency} ${fmtMoney(ages["Over 90 days"])}`,
    "Please quote your account reference with all remittances and bank transfers.",
  ];

  const codeSlug = (customerDoc?.code ?? name).replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "accounting.sales.statement",
    fileName: `statement-${codeSlug}-${statement.to}.pdf`,
    payload: {
      title: "Statement of account",
      subtitle: name,
      badge,
      meta: [
        { label: "Account No.", value: customerDoc?.code ?? recordId.slice(0, 8).toUpperCase() },
        { label: "Statement date", value: statement.to },
        { label: "Period", value: `${statement.from} to ${statement.to}` },
        { label: "Currency", value: currency },
      ],
      parties: [
        customerParty("Bill to", {
          name,
          address: contact.address,
          phone: contact.phone,
          email: contact.email,
          vatNumber: tax.vatNumber,
          taxNumber: tax.tin,
        }),
      ],
      totals: [
        { label: "Opening balance", value: `${currency} ${fmtMoney(statement.opening)}` },
        { label: "Invoiced", value: `${currency} ${fmtMoney(statement.invoiced)}` },
        { label: "Paid / Credited", value: `${currency} ${fmtMoney(statement.paid)}` },
        { label: "Balance due", value: `${currency} ${fmtMoney(statement.closing)}`, emphasis: true },
      ],
      notes: agingNotes,
      record: {
        sections: [
          {
            title: "Aging summary",
            rows: [
              { label: "Current", value: `${currency} ${fmtMoney(ages["Not yet due"])}` },
              { label: "1–30 days", value: `${currency} ${fmtMoney(ages["1 to 30 days"])}` },
              { label: "31–60 days", value: `${currency} ${fmtMoney(ages["31 to 60 days"])}` },
              { label: "61–90 days", value: `${currency} ${fmtMoney(ages["61 to 90 days"])}` },
              { label: "90+ days", value: `${currency} ${fmtMoney(ages["Over 90 days"])}` },
              { label: "Total outstanding", value: `${currency} ${fmtMoney(statement.closing)}` },
            ],
          },
        ],
        lineColumns: [
          { key: "date", label: "Date" },
          { key: "reference", label: "Reference" },
          { key: "detail", label: "Description" },
          { key: "invoiced", label: "Invoiced" },
          { key: "paid", label: "Paid" },
          { key: "balance", label: "Balance" },
        ],
        lines: lineRows,
      },
    },
    rowsForCsv: lineRows,
  };
}

async function resolveBill(companyId: string, recordId: string): Promise<SourceResolution> {
  const bill = await prisma.purchaseBill.findUnique({
    where: { id: recordId },
    include: {
      vendor: true,
      lines: true,
    },
  });

  if (!bill || bill.companyId !== companyId) {
    throw new Error("Bill not found");
  }

  const lineRows = financialLineRows(bill.lines);
  const balance = Math.max(
    0,
    bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal,
  );
  const badge =
    bill.status === "PAID"
      ? { label: "Paid", tone: "positive" as const }
      : bill.status === "VOIDED"
        ? { label: "Voided", tone: "negative" as const }
        : bill.status === "DRAFT"
          ? { label: "Draft", tone: "neutral" as const }
          : { label: "Received", tone: "warning" as const };

  const billNumber = bill.billNumber ? docLabel(bill.billNumber, "bill") : "Draft bill";

  const totals = [
    { label: "Subtotal", value: `${bill.currency} ${fmtMoney(bill.subTotal)}` },
    ...(bill.taxTotal > 0 ? [{ label: "Tax", value: `${bill.currency} ${fmtMoney(bill.taxTotal)}` }] : []),
    { label: "Total", value: `${bill.currency} ${fmtMoney(bill.total)}`, emphasis: balance <= 0 },
    ...(bill.amountPaid > 0
      ? [{ label: "Amount paid", value: `${bill.currency} ${fmtMoney(bill.amountPaid)}` }]
      : []),
    ...(bill.debitNoteTotal > 0
      ? [{ label: "Debit notes", value: `${bill.currency} ${fmtMoney(bill.debitNoteTotal)}` }]
      : []),
    ...(balance > 0 && bill.status !== "DRAFT"
      ? [{ label: "Balance due", value: `${bill.currency} ${fmtMoney(balance)}`, emphasis: true }]
      : []),
  ];

  const vendorParty = {
    title: "Bill from",
    lines: [
      bill.vendor.name,
      bill.vendor.contactName,
      bill.vendor.address,
      bill.vendor.phone,
      bill.vendor.email,
      bill.vendor.vatNumber ? `VAT ${bill.vendor.vatNumber}` : bill.vendor.taxNumber ? `Tax ${bill.vendor.taxNumber}` : null,
    ].filter((line): line is string => Boolean(line)),
  };

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "accounting.purchase.bill",
    fileName: `bill-${bill.billNumber || bill.id}.pdf`,
    payload: {
      title: "Bill",
      subtitle: billNumber,
      badge,
      meta: [
        { label: "Bill No.", value: billNumber },
        { label: "Date", value: isoDate(bill.billDate) },
        ...(bill.dueDate ? [{ label: "Due date", value: isoDate(bill.dueDate) }] : []),
        ...(bill.supplierFtiNumber ? [{ label: "Supplier Invoice", value: bill.supplierFtiNumber }] : []),
        { label: "Currency", value: bill.currency },
      ],
      parties: [vendorParty],
      totals,
      notes: bill.notes ? [bill.notes] : [],
      record: {
        sections: [],
        lineColumns: FINANCIAL_LINE_COLUMNS,
        lines: lineRows,
      },
    },
    rowsForCsv: lineRows,
  };
}

async function resolveRequisition(companyId: string, recordId: string): Promise<SourceResolution> {
  const req = await prisma.crmRequisition.findUnique({
    where: { id: recordId },
    include: {
      requestedBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true } },
      disbursedBy: { select: { name: true } },
      project: { select: { name: true } },
      site: { select: { name: true } },
      costEntries: true,
    },
  });

  if (!req || req.companyId !== companyId) {
    throw new Error("Requisition not found");
  }

  const reqNo = req.requisitionNo ? `REQ-${req.requisitionNo}` : "Draft requisition";
  const badge =
    req.status === "ACQUITTED"
      ? { label: "Acquitted", tone: "positive" as const }
      : req.status === "DISBURSED"
        ? { label: "Disbursed", tone: "neutral" as const }
        : req.status === "APPROVED"
          ? { label: "Approved", tone: "positive" as const }
          : req.status === "REJECTED" || req.status === "CANCELLED"
            ? { label: req.status === "REJECTED" ? "Rejected" : "Cancelled", tone: "negative" as const }
            : req.status === "SUBMITTED"
              ? { label: "Awaiting approval", tone: "warning" as const }
              : { label: "Draft", tone: "neutral" as const };

  const amountNum = Number(req.amount);
  const paidNum = req.paidAmount ? Number(req.paidAmount) : null;
  const spentNum = req.acquittedAmount ? Number(req.acquittedAmount) : null;
  const changeNum = req.changeAmount ? Number(req.changeAmount) : null;

  const totals = [
    { label: "Amount requested", value: `${req.currency} ${fmtMoney(amountNum)}`, emphasis: true },
    ...(paidNum !== null ? [{ label: "Amount disbursed", value: `${req.currency} ${fmtMoney(paidNum)}` }] : []),
    ...(spentNum !== null ? [{ label: "Amount spent", value: `${req.currency} ${fmtMoney(spentNum)}` }] : []),
    ...(changeNum !== null ? [{ label: "Change returned", value: `${req.currency} ${fmtMoney(changeNum)}` }] : []),
  ];

  const lines = req.costEntries.length > 0
    ? req.costEntries.map((entry) => ({
        description: entry.description,
        amount: fmtMoney(Number(entry.amount)),
        receipt: entry.receiptUrl || entry.receiptPathname ? "Yes" : "No",
        date: isoDate(entry.createdAt),
      }))
    : [
        {
          description: req.purpose,
          amount: fmtMoney(amountNum),
          receipt: "—",
          date: isoDate(req.createdAt),
        },
      ];

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "accounting.purchase.requisition",
    fileName: `requisition-${req.requisitionNo || req.id}.pdf`,
    payload: {
      title: "Requisition",
      subtitle: reqNo,
      badge,
      meta: [
        { label: "Requisition No.", value: reqNo },
        { label: "Requested by", value: req.requestedBy.name },
        { label: "Date", value: isoDate(req.createdAt) },
        ...(req.neededBy ? [{ label: "Needed by", value: isoDate(req.neededBy) }] : []),
        ...(req.project?.name ? [{ label: "Project", value: req.project.name }] : []),
        ...(req.site?.name ? [{ label: "Site", value: req.site.name }] : []),
        ...(req.approvedBy?.name ? [{ label: "Approved by", value: req.approvedBy.name }] : []),
        ...(req.disbursedBy?.name ? [{ label: "Disbursed by", value: req.disbursedBy.name }] : []),
        { label: "Currency", value: req.currency },
      ],
      parties: [],
      totals,
      notes: [req.purpose, ...(req.notes ? [req.notes] : []), ...(req.decisionNote ? [`Decision: ${req.decisionNote}`] : [])],
      record: {
        sections: [],
        lineColumns: [
          { key: "description", label: "Description / Purpose" },
          { key: "amount", label: "Amount" },
          { key: "receipt", label: "Receipt" },
          { key: "date", label: "Date" },
        ],
        lines,
      },
    },
    rowsForCsv: lines,
  };
}

async function resolveShiftList(companyId: string, filters: Record<string, string> | undefined): Promise<SourceResolution> {
  const rows = await prisma.shiftReport.findMany({
    where: {
      site: { companyId },
      ...applyDateFilter("date", filters),
      ...(filters?.siteId ? { siteId: filters.siteId } : {}),
    },
    include: {
      site: { select: { name: true } },
      section: { select: { name: true } },
      groupLeader: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }],
    take: Number(filters?.limit ?? 1000),
  });

  const exportRows = rows.map((row) => ({
    date: isoDate(row.date),
    shift: row.shift,
    site: row.site.name,
    section: row.section?.name ?? "-",
    crewCount: row.crewCount,
    workType: row.workType,
    outputTonnes: row.outputTonnes ?? 0,
    outputTrips: row.outputTrips ?? 0,
    status: row.status,
    groupLeader: row.groupLeader.name,
  }));

  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "reports.shift",
    fileName: "shift-report.pdf",
    payload: {
      title: "Shift report",
      subtitle: "Operational shift entries",
      list: {
        columns: [
          { key: "date", label: "Date" },
          { key: "shift", label: "Shift" },
          { key: "site", label: "Site" },
          { key: "section", label: "Section" },
          { key: "crewCount", label: "Crew" },
          { key: "workType", label: "Work type" },
          { key: "outputTonnes", label: "Tonnes" },
          { key: "outputTrips", label: "Trips" },
          { key: "status", label: "Status" },
        ],
        rows: exportRows,
      },
    },
    rowsForCsv: exportRows,
  };
}

async function resolveAttendanceList(companyId: string, filters: Record<string, string> | undefined): Promise<SourceResolution> {
  const rows = await prisma.attendance.findMany({
    where: {
      // The row's own company. `site: { companyId }` stopped being a complete
      // tenant filter when a register stopped needing a site.
      companyId,
      ...applyDateFilter("date", filters),
      ...(filters?.siteId ? { siteId: filters.siteId } : {}),
    },
    include: {
      site: { select: { name: true } },
      employee: { select: { employeeId: true, name: true } },
      shiftGroup: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }],
    take: Number(filters?.limit ?? 1000),
  });

  const exportRows = rows.map((row) => ({
    date: isoDate(row.date),
    shift: row.shift,
    // Blank rather than a crash: a register without a site is a whole
    // company's, which is the normal shape off a mine.
    site: row.site?.name ?? "Whole company",
    employeeId: row.employee.employeeId,
    employeeName: row.employee.name,
    shiftGroup: row.shiftGroup?.name ?? "-",
    status: row.status,
    overtime: row.overtime ?? 0,
  }));

  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "reports.attendance",
    fileName: "attendance-report.pdf",
    payload: {
      title: "Attendance report",
      subtitle: "Attendance and shift status",
      list: {
        rows: exportRows,
      },
    },
    rowsForCsv: exportRows,
  };
}

async function resolvePlantList(companyId: string, filters: Record<string, string> | undefined): Promise<SourceResolution> {
  const rows = await prisma.plantReport.findMany({
    where: {
      site: { companyId },
      ...applyDateFilter("date", filters),
      ...(filters?.siteId ? { siteId: filters.siteId } : {}),
    },
    include: {
      site: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }],
    take: Number(filters?.limit ?? 1000),
  });

  const exportRows = rows.map((row) => ({
    date: isoDate(row.date),
    site: row.site.name,
    tonnesFed: row.tonnesFed ?? 0,
    tonnesProcessed: row.tonnesProcessed ?? 0,
    runHours: row.runHours ?? 0,
    goldRecovered: row.goldRecovered ?? 0,
    status: row.status,
  }));

  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "reports.plant",
    fileName: "plant-report.pdf",
    payload: {
      title: "Plant report",
      subtitle: "Processing and output history",
      list: {
        rows: exportRows,
      },
    },
    rowsForCsv: exportRows,
  };
}

async function resolveDashboardSummary(companyId: string): Promise<SourceResolution> {
  const [users, employees, openWorkOrders, draftInvoices, reports] = await Promise.all([
    prisma.user.count({ where: { companyId } }),
    prisma.employee.count({ where: { companyId, isActive: true } }),
    prisma.workOrder.count({ where: { equipment: { site: { companyId } }, status: "OPEN" } }),
    prisma.salesInvoice.count({ where: { companyId, status: "DRAFT" } }),
    prisma.shiftReport.count({
      where: {
        site: { companyId },
        date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return {
    targetType: "DASHBOARD",
    documentType: "DASHBOARD_PACK",
    sourceKey: "dashboard.executive-summary",
    fileName: "dashboard-summary.pdf",
    payload: {
      title: "Executive dashboard summary",
      dashboard: {
        metrics: [
          { label: "Users", value: users.toLocaleString() },
          { label: "Active workers", value: employees.toLocaleString() },
          { label: "Open work orders", value: openWorkOrders.toLocaleString() },
          { label: "Draft invoices", value: draftInvoices.toLocaleString() },
          { label: "Shift Reports (30d)", value: reports.toLocaleString() },
        ],
      },
    },
  };
}

/**
 * What a source will produce and how many rows, without building it where
 * that can be avoided. Used to decide whether an export is made now or by a
 * job, and whether it is made at all.
 */
export async function summarizeSource(
  companyId: string,
  rawInput: SourceResolutionInput,
  context: SourceContext = { actorId: null },
): Promise<SourceSummary> {
  // A CRM list counts its rows with one query rather than building them all.
  if (isCrmRegisterSourceKey(rawInput.sourceKey)) {
    const input = sourceInputSchema.parse(rawInput);
    return summarizeCrmRegisterSource(companyId, input, context.actorId);
  }
  const source = await resolveSourcePayload(companyId, rawInput, context);
  return {
    targetType: source.targetType,
    documentType: source.documentType,
    sourceKey: source.sourceKey,
    rowCount: source.rowsForCsv?.length ?? source.payload.list?.rows?.length ?? 0,
  };
}

export async function resolveSourcePayload(
  companyId: string,
  rawInput: SourceResolutionInput,
  context: SourceContext = { actorId: null },
): Promise<SourceResolution> {
  const input = sourceInputSchema.parse(rawInput);

  // A CRM list is only ever built here, from the reader's own filters: a
  // payload handed in with the request is not an export of the list.
  if (isCrmRegisterSourceKey(input.sourceKey)) {
    return resolveCrmRegisterSource(companyId, input, context.actorId);
  }

  if (input.payload) {
    return {
      targetType: input.target,
      documentType:
        input.target === "LIST"
          ? "REPORT_TABLE"
          : input.target === "DASHBOARD"
            ? "DASHBOARD_PACK"
            : "GENERIC_RECORD",
      sourceKey: input.sourceKey,
      fileName: input.payload.fileName || `${input.sourceKey.replace(/[^a-z0-9-]/gi, "-")}.pdf`,
      payload: input.payload,
      rowsForCsv: input.payload.list?.rows,
    };
  }

  // Iteration 5 — the school's own documents. Kept in their own file because
  // there are eight of them and this one is long enough; dispatched here so a
  // school document is rendered by the same pipeline, the same template and the
  // same letterhead as everything else the product prints.
  if (isSchoolDocumentSourceKey(input.sourceKey)) {
    return resolveSchoolDocument(companyId, {
      sourceKey: input.sourceKey,
      recordId: input.recordId,
      filters: input.filters,
    });
  }

  // The payslip. Same reasoning as the school documents above: dispatched here so
  // it gets the same letterhead, the same PDF renderer and the same template
  // editor as everything else the product prints, rather than payroll growing its
  // own printing.
  if (isHrDocumentSourceKey(input.sourceKey)) {
    return resolveHrDocumentSource({
      companyId,
      sourceKey: input.sourceKey,
      recordId: input.recordId,
    });
  }

  switch (input.sourceKey) {
    case "accounting.sales.invoice":
      if (!input.recordId) throw new Error("recordId is required for invoice export");
      return resolveInvoice(companyId, input.recordId);
    case "accounting.sales.quotation":
      if (!input.recordId) throw new Error("recordId is required for quotation export");
      return resolveQuotation(companyId, input.recordId);
    case "accounting.sales.receipt":
      if (!input.recordId) throw new Error("recordId is required for receipt export");
      return resolveReceipt(companyId, input.recordId);
    case "accounting.sales.credit-note":
      if (!input.recordId) throw new Error("recordId is required for credit note export");
      return resolveCreditNote(companyId, input.recordId);
    case "accounting.sales.statement":
      if (!input.recordId) throw new Error("recordId is required for statement export");
      return resolveCustomerStatement(companyId, input.recordId, input.filters);
    case "accounting.purchase.bill":
      if (!input.recordId) throw new Error("recordId is required for bill export");
      return resolveBill(companyId, input.recordId);
    case "accounting.purchase.requisition":
      if (!input.recordId) throw new Error("recordId is required for requisition export");
      return resolveRequisition(companyId, input.recordId);
    case "reports.shift":
      return resolveShiftList(companyId, input.filters);
    case "reports.attendance":
      return resolveAttendanceList(companyId, input.filters);
    case "reports.plant":
      return resolvePlantList(companyId, input.filters);
    case "dashboard.executive-summary":
      return resolveDashboardSummary(companyId);
    default:
      throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
  }
}
