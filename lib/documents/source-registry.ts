import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ExportTargetType, UniversalDocumentPayload } from "@/lib/documents/types";
import {
  isSchoolDocumentSourceKey,
  resolveSchoolDocument,
} from "@/lib/documents/schools-sources";
import {
  isHrDocumentSourceKey,
  resolveHrDocumentSource,
} from "@/lib/documents/hr-sources";

const sourceInputSchema = z.object({
  target: z.enum(["LIST", "RECORD", "DASHBOARD"]),
  sourceKey: z.string().min(1),
  recordId: z.string().uuid().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  payload: z
    .object({
      title: z.string().min(1),
      subtitle: z.string().optional(),
      fileName: z.string().optional(),
      meta: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
      list: z
        .object({
          columns: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
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

function applyDateFilter(dateField: string, filters: Record<string, string> | undefined) {
  const startDate = filters?.startDate;
  const endDate = filters?.endDate;
  if (!startDate && !endDate) return {};

  const dateFilter: Record<string, Date> = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);
  return { [dateField]: dateFilter };
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
      title: "Shift Report",
      subtitle: "Operational shift entries",
      list: {
        columns: [
          { key: "date", label: "Date" },
          { key: "shift", label: "Shift" },
          { key: "site", label: "Site" },
          { key: "section", label: "Section" },
          { key: "crewCount", label: "Crew" },
          { key: "workType", label: "Work Type" },
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
      title: "Attendance Report",
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
      title: "Plant Report",
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
      title: "Executive Dashboard Summary",
      dashboard: {
        metrics: [
          { label: "Users", value: users.toLocaleString() },
          { label: "Active Workers", value: employees.toLocaleString() },
          { label: "Open Work Orders", value: openWorkOrders.toLocaleString() },
          { label: "Draft Invoices", value: draftInvoices.toLocaleString() },
          { label: "Shift Reports (30d)", value: reports.toLocaleString() },
        ],
      },
    },
  };
}

export async function resolveSourcePayload(
  companyId: string,
  rawInput: SourceResolutionInput,
): Promise<SourceResolution> {
  const input = sourceInputSchema.parse(rawInput);

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
