/**
 * The books' printable documents — a sales invoice, a quotation, a receipt, a
 * credit note — resolved into the universal payload the documents module
 * renders. A host registers this source (`registerDocumentSource` from its
 * `modules.ts`); the feature that opens each is `booksDocumentFeatureKeys`.
 */
import { prisma } from "@corelithzw/db/client";
import type { SourceResolution } from "@corelithzw/module-documents/source-registry";

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
  { key: "unitPrice", label: "Unit Price" },
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

async function resolveInvoice(companyId: string, recordId: string): Promise<SourceResolution> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: recordId },
    include: {
      customer: true,
      lines: true,
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
      subtitle: invoice.invoiceNumber,
      badge,
      meta: [
        { label: "Invoice No.", value: invoice.invoiceNumber },
        { label: "Issue Date", value: isoDate(invoice.invoiceDate) },
        { label: "Due Date", value: isoDate(invoice.dueDate) },
        { label: "Currency", value: invoice.currency },
      ],
      parties: [customerParty("Bill To", invoice.customer)],
      totals,
      notes: invoice.notes ? [invoice.notes] : [],
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
        { label: "Valid Until", value: isoDate(quotation.validUntil) },
        { label: "Currency", value: quotation.currency },
      ],
      parties: [customerParty("Prepared For", quotation.customer)],
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

  const currency = receipt.invoice?.currency ?? "USD";
  const rows = [
    {
      receiptNumber: receipt.receiptNumber,
      receivedAt: isoDate(receipt.receivedAt),
      amount: receipt.amount,
      method: receipt.method,
      reference: receipt.reference ?? "",
      invoiceNumber: receipt.invoice?.invoiceNumber ?? "",
      customer: receipt.invoice?.customer?.name ?? "",
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
      title: "Payment Receipt",
      subtitle: receipt.receiptNumber,
      badge: { label: "Payment received", tone: "positive" },
      meta: [
        { label: "Receipt No.", value: receipt.receiptNumber },
        { label: "Date", value: isoDate(receipt.receivedAt) },
        { label: "Method", value: receipt.method },
        ...(receipt.bankAccount?.name ? [{ label: "Bank", value: receipt.bankAccount.name }] : []),
      ],
      parties: receipt.invoice?.customer
        ? [customerParty("Received From", receipt.invoice.customer)]
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
      title: "Credit Note",
      subtitle: note.noteNumber,
      badge:
        note.status === "ISSUED"
          ? { label: "Issued", tone: "positive" }
          : { label: note.status, tone: "neutral" },
      meta: [
        { label: "Credit Note No.", value: note.noteNumber },
        { label: "Date", value: isoDate(note.noteDate) },
        { label: "Against Invoice", value: note.invoice?.invoiceNumber ?? "—" },
        { label: "Currency", value: currency },
      ],
      parties: note.invoice?.customer ? [customerParty("Credited To", note.invoice.customer)] : [],
      totals: [{ label: "Total credited", value: `${currency} ${fmtMoney(note.total)}`, emphasis: true }],
      notes: note.reason ? [note.reason] : [],
      record: {
        sections: [],
        lineColumns: [
          { key: "description", label: "Description" },
          { key: "quantity", label: "Qty" },
          { key: "unitPrice", label: "Unit Price" },
          { key: "lineTotal", label: "Amount" },
        ],
        lines: lineRows,
      },
    },
    rowsForCsv: lineRows,
  };
}

export const BOOKS_DOCUMENT_SOURCE_PREFIX = "accounting.";

/** Sales documents open from the books or from the CRM; a tenant needs either. */
const BOOKS_DOCUMENT_FEATURES: Record<string, string[]> = {
  "accounting.sales.invoice": ["accounting.ar", "crm.documents"],
  "accounting.sales.quotation": ["accounting.ar", "crm.documents"],
  "accounting.sales.receipt": ["accounting.ar", "crm.documents"],
  "accounting.sales.credit-note": ["accounting.ar"],
};

export function booksDocumentFeatureKeys(sourceKey: string): string[] {
  return BOOKS_DOCUMENT_FEATURES[sourceKey] ?? [];
}

export async function resolveBooksDocument(input: {
  companyId: string;
  sourceKey: string;
  recordId?: string;
  filters?: Record<string, string>;
}): Promise<SourceResolution> {
  const { companyId } = input;
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
    default:
      throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
  }
}
