import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ExportTargetType, UniversalDocumentPayload } from "@/lib/documents/types";
import { parseScrapTicketPhotosJson } from "@/lib/scrap-metal/attachments";

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

  const lineRows = invoice.lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    taxAmount: line.taxAmount,
    lineTotal: line.lineTotal,
  }));

  return {
    targetType: "RECORD",
    documentType: "SALES_INVOICE",
    sourceKey: "accounting.sales.invoice",
    fileName: `invoice-${invoice.invoiceNumber}.pdf`,
    payload: {
      title: "Sales Invoice",
      subtitle: invoice.invoiceNumber,
      meta: [
        { label: "Invoice #", value: invoice.invoiceNumber },
        { label: "Date", value: isoDate(invoice.invoiceDate) },
        { label: "Currency", value: invoice.currency },
        { label: "Status", value: invoice.status },
      ],
      record: {
        sections: [
          {
            title: "Customer",
            rows: [
              { label: "Name", value: invoice.customer.name },
              { label: "Address", value: invoice.customer.address ?? "-" },
              { label: "Tax", value: invoice.customer.taxNumber ?? "-" },
            ],
          },
          {
            title: "Totals",
            rows: [
              { label: "Sub total", value: String(invoice.subTotal) },
              { label: "Tax", value: String(invoice.taxTotal) },
              { label: "Total", value: String(invoice.total) },
            ],
          },
        ],
        lineColumns: [
          { key: "description", label: "Description" },
          { key: "quantity", label: "Qty" },
          { key: "unitPrice", label: "Unit Price" },
          { key: "taxRate", label: "Tax %" },
          { key: "taxAmount", label: "Tax" },
          { key: "lineTotal", label: "Line Total" },
        ],
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

  const lineRows = quotation.lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    taxAmount: line.taxAmount,
    lineTotal: line.lineTotal,
  }));

  return {
    targetType: "RECORD",
    documentType: "SALES_QUOTATION",
    sourceKey: "accounting.sales.quotation",
    fileName: `quotation-${quotation.quotationNumber}.pdf`,
    payload: {
      title: "Sales Quotation",
      subtitle: quotation.quotationNumber,
      meta: [
        { label: "Quotation #", value: quotation.quotationNumber },
        { label: "Date", value: isoDate(quotation.quotationDate) },
        { label: "Valid Until", value: isoDate(quotation.validUntil) },
        { label: "Status", value: quotation.status },
      ],
      record: {
        sections: [
          {
            title: "Customer",
            rows: [
              { label: "Name", value: quotation.customer.name },
              { label: "Address", value: quotation.customer.address ?? "-" },
            ],
          },
          {
            title: "Totals",
            rows: [
              { label: "Sub total", value: String(quotation.subTotal) },
              { label: "Tax", value: String(quotation.taxTotal) },
              { label: "Total", value: String(quotation.total) },
            ],
          },
        ],
        lineColumns: [
          { key: "description", label: "Description" },
          { key: "quantity", label: "Qty" },
          { key: "unitPrice", label: "Unit Price" },
          { key: "taxRate", label: "Tax %" },
          { key: "taxAmount", label: "Tax" },
          { key: "lineTotal", label: "Line Total" },
        ],
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

  return {
    targetType: "RECORD",
    documentType: "SALES_RECEIPT",
    sourceKey: "accounting.sales.receipt",
    fileName: `receipt-${receipt.receiptNumber}.pdf`,
    payload: {
      title: "Sales Receipt",
      subtitle: receipt.receiptNumber,
      meta: [
        { label: "Receipt #", value: receipt.receiptNumber },
        { label: "Date", value: isoDate(receipt.receivedAt) },
        { label: "Method", value: receipt.method },
      ],
      record: {
        sections: [
          {
            title: "Payment",
            rows: [
              { label: "Amount", value: String(receipt.amount) },
              { label: "Reference", value: receipt.reference ?? "-" },
              { label: "Bank", value: receipt.bankAccount?.name ?? "-" },
            ],
          },
          {
            title: "Linked Invoice",
            rows: [
              { label: "Invoice", value: receipt.invoice?.invoiceNumber ?? "-" },
              { label: "Customer", value: receipt.invoice?.customer?.name ?? "-" },
            ],
          },
        ],
      },
    },
    rowsForCsv: rows,
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
      site: { companyId },
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
    site: row.site.name,
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

async function resolveScrapPurchaseTicket(companyId: string, recordId: string): Promise<SourceResolution> {
  const purchase = await prisma.scrapMetalPurchase.findUnique({
    where: { id: recordId },
    include: {
      site: { select: { name: true, code: true } },
      employee: { select: { name: true, employeeId: true } },
      material: { select: { name: true, code: true } },
      sellerProfile: { select: { fullName: true, phone: true, nationalId: true } },
    },
  });

  if (!purchase || purchase.companyId !== companyId) {
    throw new Error("Inbound ticket not found");
  }

  const attachments = parseScrapTicketPhotosJson(purchase.attachmentsJson);
  const lineRows = [
    {
      material: purchase.material?.name ?? purchase.category,
      code: purchase.material?.code ?? purchase.category,
      weightKg: purchase.weight,
      pricePerKg: purchase.pricePerKg,
      total: purchase.totalAmount,
    },
  ];

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "scrap-metal.purchase-ticket",
    fileName: `inbound-ticket-${purchase.purchaseNumber}.pdf`,
    payload: {
      title: "Inbound Ticket",
      subtitle: purchase.purchaseNumber,
      meta: [
        { label: "Ticket #", value: purchase.purchaseNumber },
        { label: "Date", value: isoDate(purchase.purchaseDate) },
        { label: "Site", value: `${purchase.site.name} (${purchase.site.code})` },
        { label: "Status", value: purchase.status },
      ],
      record: {
        sections: [
          {
            title: "Supplier",
            rows: [
              { label: "Name", value: purchase.sellerProfile?.fullName ?? purchase.sellerName ?? "-" },
              { label: "Phone", value: purchase.sellerProfile?.phone ?? purchase.sellerPhone ?? "-" },
              { label: "ID", value: purchase.sellerProfile?.nationalId ?? "-" },
            ],
          },
          {
            title: "Buyer / Cashier",
            rows: [
              { label: "Name", value: purchase.employee.name },
              { label: "Employee ID", value: purchase.employee.employeeId },
              { label: "Payment Method", value: purchase.paymentMethod ?? "-" },
              { label: "Payment Reference", value: purchase.paymentReference ?? "-" },
            ],
          },
          {
            title: "Notes",
            rows: [
              { label: "Notes", value: purchase.notes ?? "-" },
              { label: "Photos", value: `${attachments.length}` },
            ],
          },
        ],
        lineColumns: [
          { key: "material", label: "Material" },
          { key: "code", label: "Code" },
          { key: "weightKg", label: "Weight (kg)" },
          { key: "pricePerKg", label: "Price / kg" },
          { key: "total", label: "Total" },
        ],
        lines: lineRows,
      },
    },
    rowsForCsv: lineRows,
  };
}

async function resolveScrapSaleTicket(companyId: string, recordId: string): Promise<SourceResolution> {
  const sale = await prisma.scrapMetalSale.findUnique({
    where: { id: recordId },
    include: {
      site: { select: { name: true, code: true } },
      batch: { select: { batchNumber: true, category: true } },
      material: { select: { name: true, code: true } },
    },
  });

  if (!sale || sale.companyId !== companyId) {
    throw new Error("Outbound ticket not found");
  }

  const attachments = parseScrapTicketPhotosJson(sale.attachmentsJson);
  const lineRows = [
    {
      lot: sale.batch.batchNumber,
      material: sale.material?.name ?? sale.batch.category,
      code: sale.material?.code ?? sale.batch.category,
      recordedKg: sale.recordedWeight,
      soldKg: sale.soldWeight,
      varianceKg: sale.weightDiscrepancy,
      pricePerKg: sale.pricePerKg,
      total: sale.totalAmount,
    },
  ];

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "scrap-metal.sale-ticket",
    fileName: `outbound-ticket-${sale.saleNumber}.pdf`,
    payload: {
      title: "Outbound Ticket",
      subtitle: sale.saleNumber,
      meta: [
        { label: "Ticket #", value: sale.saleNumber },
        { label: "Date", value: isoDate(sale.saleDate) },
        { label: "Site", value: `${sale.site.name} (${sale.site.code})` },
        { label: "Status", value: sale.status },
      ],
      record: {
        sections: [
          {
            title: "Buyer",
            rows: [
              { label: "Name", value: sale.buyerName },
              { label: "Contact", value: sale.buyerContact ?? "-" },
              { label: "Payment Method", value: sale.paymentMethod ?? "-" },
              { label: "Payment Reference", value: sale.paymentReference ?? "-" },
            ],
          },
          {
            title: "Notes",
            rows: [
              { label: "Notes", value: sale.notes ?? "-" },
              { label: "Photos", value: `${attachments.length}` },
            ],
          },
        ],
        lineColumns: [
          { key: "lot", label: "Lot" },
          { key: "material", label: "Material" },
          { key: "code", label: "Code" },
          { key: "recordedKg", label: "Recorded (kg)" },
          { key: "soldKg", label: "Accepted (kg)" },
          { key: "varianceKg", label: "Variance (kg)" },
          { key: "pricePerKg", label: "Price / kg" },
          { key: "total", label: "Total" },
        ],
        lines: lineRows,
      },
    },
    rowsForCsv: lineRows,
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
    case "reports.shift":
      return resolveShiftList(companyId, input.filters);
    case "reports.attendance":
      return resolveAttendanceList(companyId, input.filters);
    case "reports.plant":
      return resolvePlantList(companyId, input.filters);
    case "dashboard.executive-summary":
      return resolveDashboardSummary(companyId);
    case "scrap-metal.purchase-ticket":
      if (!input.recordId) throw new Error("recordId is required for inbound ticket export");
      return resolveScrapPurchaseTicket(companyId, input.recordId);
    case "scrap-metal.sale-ticket":
      if (!input.recordId) throw new Error("recordId is required for outbound ticket export");
      return resolveScrapSaleTicket(companyId, input.recordId);
    default:
      throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
  }
}
