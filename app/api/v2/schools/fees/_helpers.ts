import {
  Prisma,
  type AccountingSourceType,
  type SchoolFeeInvoiceStatus,
} from "@prisma/client";
import { captureAccountingEvent } from "@/lib/accounting/integration";

export type SchoolFeeAccountingEventType =
  | "SCHOOL_FEE_INVOICE_ISSUED"
  | "SCHOOL_FEE_RECEIPT_POSTED"
  | "SCHOOL_FEE_RECEIPT_VOIDED"
  | "SCHOOL_FEE_WAIVER_APPLIED"
  | "SCHOOL_FEE_WRITEOFF_POSTED";

type SchoolFeeAccountingEventInput = {
  companyId: string;
  actorId: string;
  eventType: SchoolFeeAccountingEventType;
  sourceId: string;
  sourceRef: string;
  entryDate: Date;
  amount: number;
  netAmount?: number;
  taxAmount?: number;
  grossAmount?: number;
  currency?: string;
  payload?: Record<string, unknown>;
  invertDirection?: boolean;
  version?: number;
};

function toMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toMoneyOrZero(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return toMoney(value);
}

function toPostingSourceType(
  eventType: SchoolFeeAccountingEventType,
): AccountingSourceType {
  switch (eventType) {
    case "SCHOOL_FEE_INVOICE_ISSUED":
      return "SALES_INVOICE";
    case "SCHOOL_FEE_RECEIPT_POSTED":
    case "SCHOOL_FEE_RECEIPT_VOIDED":
      return "SALES_RECEIPT";
    case "SCHOOL_FEE_WAIVER_APPLIED":
    case "SCHOOL_FEE_WRITEOFF_POSTED":
      return "SALES_WRITE_OFF";
    default:
      return "MANUAL";
  }
}

function buildPostingSourceId(input: {
  eventType: SchoolFeeAccountingEventType;
  sourceId: string;
}) {
  if (input.eventType === "SCHOOL_FEE_RECEIPT_VOIDED") {
    return `SCHOOL_FEE_RECEIPT_VOID:${input.sourceId}`;
  }
  if (input.eventType === "SCHOOL_FEE_WRITEOFF_POSTED") {
    return `SCHOOL_FEE_WRITEOFF:${input.sourceId}`;
  }
  if (input.eventType === "SCHOOL_FEE_WAIVER_APPLIED") {
    return `SCHOOL_FEE_WAIVER:${input.sourceId}`;
  }
  if (input.eventType === "SCHOOL_FEE_INVOICE_ISSUED") {
    return `SCHOOL_FEE_INVOICE:${input.sourceId}`;
  }
  return `SCHOOL_FEE_RECEIPT:${input.sourceId}`;
}

export async function emitSchoolFeeAccountingEvent(
  input: SchoolFeeAccountingEventInput,
) {
  const sourceType = toPostingSourceType(input.eventType);
  const postingSourceId = buildPostingSourceId({
    eventType: input.eventType,
    sourceId: input.sourceId,
  });
  const version = input.version ?? 1;
  const idempotencyKey = `schools:${input.eventType}:${input.sourceId}:v${version}`;

  return captureAccountingEvent({
    companyId: input.companyId,
    sourceDomain: "schools-fees",
    sourceAction: input.eventType,
    sourceType,
    sourceId: postingSourceId,
    entryDate: input.entryDate,
    description: `${input.eventType} (${input.sourceRef})`,
    amount: toMoneyOrZero(input.amount),
    netAmount: toMoneyOrZero(input.netAmount),
    taxAmount: toMoneyOrZero(input.taxAmount),
    grossAmount: toMoneyOrZero(input.grossAmount ?? input.amount),
    currency: input.currency ?? "USD",
    createdById: input.actorId,
    status: "PENDING",
    payload: {
      idempotencyKey,
      eventType: input.eventType,
      sourceRef: input.sourceRef,
      sourceId: input.sourceId,
      postingSourceId,
      invertDirection: input.invertDirection === true,
      ...input.payload,
    },
  });
}

export function recalculateFeeInvoiceStatus(input: {
  currentStatus: string;
  totalAmount: number;
  paidAmount: number;
  waivedAmount: number;
  writeOffAmount: number;
  balanceAmount: number;
}) {
  const current = input.currentStatus;
  if (current === "VOIDED" || current === "WRITEOFF") return current;
  if (input.totalAmount <= 0) return "DRAFT";
  if (input.balanceAmount <= 0) return "PAID";
  if (input.paidAmount > 0 || input.waivedAmount > 0 || input.writeOffAmount > 0) {
    return "PART_PAID";
  }
  return current === "DRAFT" ? "DRAFT" : "ISSUED";
}

export async function refreshFeeInvoiceBalance(
  tx: Prisma.TransactionClient,
  input: { companyId: string; invoiceId: string },
) {
  const { companyId, invoiceId } = input;

  const [invoice, lines, allocations, waivers] = await Promise.all([
    tx.schoolFeeInvoice.findFirst({
      where: { id: invoiceId, companyId },
      select: {
        id: true,
        status: true,
      },
    }),
    tx.schoolFeeInvoiceLine.findMany({
      where: { invoiceId, companyId },
      select: { lineTotal: true, taxAmount: true },
    }),
    tx.schoolFeeReceiptAllocation.findMany({
      where: {
        companyId,
        invoiceId,
        receipt: { status: "POSTED" },
      },
      select: { allocatedAmount: true },
    }),
    tx.schoolFeeWaiver.findMany({
      where: {
        companyId,
        invoiceId,
        status: "APPLIED",
      },
      select: { amount: true },
    }),
  ]);

  if (!invoice) return null;

  const subTotal = toMoney(
    lines.reduce((sum, line) => sum + Math.max(line.lineTotal - line.taxAmount, 0), 0),
  );
  const taxTotal = toMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const totalAmount = toMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const paidAmount = toMoney(
    allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0),
  );
  const waivedAmount = toMoney(waivers.reduce((sum, waiver) => sum + waiver.amount, 0));
  const writeOffAmount = invoice.status === "WRITEOFF" ? toMoney(totalAmount - paidAmount - waivedAmount) : 0;
  const balanceAmount = toMoney(
    Math.max(totalAmount - paidAmount - waivedAmount - writeOffAmount, 0),
  );
  const nextStatus = recalculateFeeInvoiceStatus({
    currentStatus: invoice.status,
    totalAmount,
    paidAmount,
    waivedAmount,
    writeOffAmount,
    balanceAmount,
  });

  return tx.schoolFeeInvoice.update({
    where: { id: invoiceId },
    data: {
      subTotal,
      taxTotal,
      totalAmount,
      paidAmount,
      waivedAmount,
      writeOffAmount,
      balanceAmount,
      status: nextStatus as SchoolFeeInvoiceStatus,
    },
  });
}
