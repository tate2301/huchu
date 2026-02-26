import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";

type VatComputationRow = {
  taxCodeId: string | null;
  code: string;
  name: string;
  rate: number;
  taxableAmount: number;
  outputTax: number;
  inputTax: number;
  adjustments: number;
  netTax: number;
};

type Vat7Boxes = Record<string, number>;

type VatScheduleItem = {
  source: "SALES" | "PURCHASE";
  taxCodeId: string | null;
  code: string;
  name: string;
  currency: string;
  taxableAmount: number;
  taxAmount: number;
};

type VatComputationResult = {
  rows: VatComputationRow[];
  totals: {
    outputTax: number;
    inputTax: number;
    adjustmentsTax: number;
    netTax: number;
  };
  vat7Boxes: Vat7Boxes;
  schedules: {
    foreignCurrency: VatScheduleItem[];
    rtgs: VatScheduleItem[];
    withholding: VatScheduleItem[];
  };
};

const DEFAULT_BOXES: Vat7Boxes = {
  outputStandardRatedValue: 0,
  outputStandardRatedTax: 0,
  outputZeroRatedLocalValue: 0,
  outputZeroRatedExportValue: 0,
  outputExemptValue: 0,
  outputImportedServicesTax: 0,
  outputAdjustmentsTax: 0,
  outputBadDebtsTax: 0,
  inputDomesticTax: 0,
  inputImportedGoodsTax: 0,
  inputCapitalGoodsTax: 0,
  inputAdjustmentsTax: 0,
  inputDisallowedTax: 0,
  vatWithheldTax: 0,
  totalOutputTax: 0,
  totalInputTax: 0,
  vatPayable: 0,
  vatRefundable: 0,
};

function classifyOutputBox(taxCode: { code?: string | null; name?: string | null; type?: string | null; vat7OutputBox?: string | null } | null) {
  const explicit = taxCode?.vat7OutputBox?.trim();
  if (explicit) return explicit;

  const haystack = `${taxCode?.code ?? ""} ${taxCode?.name ?? ""} ${taxCode?.type ?? ""}`.toUpperCase();
  if (haystack.includes("WITHHOLD")) return "vatWithheldTax";
  if (haystack.includes("EXPORT")) return "outputZeroRatedExportValue";
  if (haystack.includes("ZERO")) return "outputZeroRatedLocalValue";
  if (haystack.includes("EXEMPT")) return "outputExemptValue";
  if (haystack.includes("IMPORT")) return "outputImportedServicesTax";
  if (haystack.includes("BAD") && haystack.includes("DEBT")) return "outputBadDebtsTax";
  if (haystack.includes("ADJUST") || haystack.includes("DEBIT") || haystack.includes("CREDIT")) {
    return "outputAdjustmentsTax";
  }
  return "outputStandardRatedTax";
}

function classifyInputBox(taxCode: { code?: string | null; name?: string | null; type?: string | null; vat7InputBox?: string | null } | null) {
  const explicit = taxCode?.vat7InputBox?.trim();
  if (explicit) return explicit;

  const haystack = `${taxCode?.code ?? ""} ${taxCode?.name ?? ""} ${taxCode?.type ?? ""}`.toUpperCase();
  if (haystack.includes("CAPITAL")) return "inputCapitalGoodsTax";
  if (haystack.includes("IMPORT")) return "inputImportedGoodsTax";
  if (haystack.includes("EXEMPT") || haystack.includes("DISALLOW")) return "inputDisallowedTax";
  if (haystack.includes("ADJUST") || haystack.includes("DEBIT") || haystack.includes("CREDIT")) {
    return "inputAdjustmentsTax";
  }
  return "inputDomesticTax";
}

function classifyScheduleType(
  taxCode: { scheduleType?: string | null; type?: string | null } | null,
  currency: string,
  baseCurrency: string,
) {
  const explicit = String(taxCode?.scheduleType ?? "NONE").toUpperCase();
  if (["FX", "RTGS", "WITHHOLDING"].includes(explicit)) return explicit;

  const codeType = String(taxCode?.type ?? "").toUpperCase();
  if (codeType.includes("WITHHOLD")) return "WITHHOLDING";

  const normalizedCurrency = String(currency || baseCurrency).toUpperCase();
  if (["RTGS", "ZIG"].includes(normalizedCurrency)) return "RTGS";
  if (normalizedCurrency !== String(baseCurrency).toUpperCase()) return "FX";
  return "NONE";
}

function getDueDate(baseDate: Date, dayOfMonth: number) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, dayOfMonth);
}

function ensureVatTransition(current: string, next: string) {
  const transitions: Record<string, string[]> = {
    DRAFT: ["REVIEWED", "VOIDED"],
    REVIEWED: ["DRAFT", "FINALIZED", "VOIDED"],
    FINALIZED: ["FILED", "VOIDED"],
    FILED: [],
    VOIDED: [],
  };
  const allowed = transitions[current] ?? [];
  return allowed.includes(next);
}

export async function computeVatReturnSnapshot(input: {
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  adjustmentsTax?: number;
}) {
  const [settings, salesLines, purchaseLines] = await Promise.all([
    prisma.accountingSettings.findUnique({
      where: { companyId: input.companyId },
      select: { baseCurrency: true },
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        invoice: {
          companyId: input.companyId,
          status: { in: ["ISSUED", "PAID"] },
          invoiceDate: {
            gte: input.periodStart,
            lte: input.periodEnd,
          },
        },
      },
      select: {
        taxCodeId: true,
        taxAmount: true,
        lineTotal: true,
        taxCode: {
          select: {
            id: true,
            code: true,
            name: true,
            rate: true,
            type: true,
            vat7OutputBox: true,
            vat7InputBox: true,
            scheduleType: true,
          },
        },
        invoice: {
          select: {
            currency: true,
          },
        },
      },
    }),
    prisma.purchaseBillLine.findMany({
      where: {
        bill: {
          companyId: input.companyId,
          status: { in: ["RECEIVED", "PAID"] },
          billDate: {
            gte: input.periodStart,
            lte: input.periodEnd,
          },
        },
      },
      select: {
        taxCodeId: true,
        taxAmount: true,
        lineTotal: true,
        taxCode: {
          select: {
            id: true,
            code: true,
            name: true,
            rate: true,
            type: true,
            vat7OutputBox: true,
            vat7InputBox: true,
            scheduleType: true,
          },
        },
        bill: {
          select: {
            currency: true,
          },
        },
      },
    }),
  ]);

  const baseCurrency = settings?.baseCurrency ?? "USD";

  const rowMap = new Map<string | null, VatComputationRow>();
  const ensureRow = (taxCodeId: string | null, fallback?: { code?: string; name?: string; rate?: number }) => {
    if (!rowMap.has(taxCodeId)) {
      rowMap.set(taxCodeId, {
        taxCodeId,
        code: fallback?.code ?? "UNCLASSIFIED",
        name: fallback?.name ?? "Unclassified",
        rate: toMoney(fallback?.rate ?? 0),
        taxableAmount: 0,
        outputTax: 0,
        inputTax: 0,
        adjustments: 0,
        netTax: 0,
      });
    }
    return rowMap.get(taxCodeId)!;
  };

  const vat7Boxes: Vat7Boxes = { ...DEFAULT_BOXES };
  const schedules = {
    foreignCurrency: [] as VatScheduleItem[],
    rtgs: [] as VatScheduleItem[],
    withholding: [] as VatScheduleItem[],
  };

  for (const line of salesLines) {
    const tax = toMoney(line.taxAmount);
    const gross = toMoney(line.lineTotal);
    const taxable = Math.max(0, toMoney(gross - tax));
    const taxCode = line.taxCode;
    const row = ensureRow(line.taxCodeId ?? null, {
      code: taxCode?.code,
      name: taxCode?.name,
      rate: taxCode?.rate,
    });

    row.taxableAmount = toMoney(row.taxableAmount + taxable);
    row.outputTax = toMoney(row.outputTax + tax);

    const outputBox = classifyOutputBox(taxCode);
    if (outputBox.endsWith("Value")) {
      vat7Boxes[outputBox] = toMoney((vat7Boxes[outputBox] ?? 0) + taxable);
    } else {
      vat7Boxes[outputBox] = toMoney((vat7Boxes[outputBox] ?? 0) + tax);
    }
    if (outputBox === "outputStandardRatedTax") {
      vat7Boxes.outputStandardRatedValue = toMoney(vat7Boxes.outputStandardRatedValue + taxable);
    }

    const scheduleType = classifyScheduleType(taxCode, line.invoice.currency, baseCurrency);
    const scheduleItem: VatScheduleItem = {
      source: "SALES",
      taxCodeId: line.taxCodeId,
      code: taxCode?.code ?? "UNCLASSIFIED",
      name: taxCode?.name ?? "Unclassified",
      currency: line.invoice.currency,
      taxableAmount: taxable,
      taxAmount: tax,
    };
    if (scheduleType === "FX") schedules.foreignCurrency.push(scheduleItem);
    if (scheduleType === "RTGS") schedules.rtgs.push(scheduleItem);
    if (scheduleType === "WITHHOLDING") schedules.withholding.push(scheduleItem);
  }

  for (const line of purchaseLines) {
    const tax = toMoney(line.taxAmount);
    const gross = toMoney(line.lineTotal);
    const taxable = Math.max(0, toMoney(gross - tax));
    const taxCode = line.taxCode;
    const row = ensureRow(line.taxCodeId ?? null, {
      code: taxCode?.code,
      name: taxCode?.name,
      rate: taxCode?.rate,
    });

    row.taxableAmount = toMoney(row.taxableAmount - taxable);
    row.inputTax = toMoney(row.inputTax + tax);

    const inputBox = classifyInputBox(taxCode);
    vat7Boxes[inputBox] = toMoney((vat7Boxes[inputBox] ?? 0) + tax);

    const scheduleType = classifyScheduleType(taxCode, line.bill.currency, baseCurrency);
    const scheduleItem: VatScheduleItem = {
      source: "PURCHASE",
      taxCodeId: line.taxCodeId,
      code: taxCode?.code ?? "UNCLASSIFIED",
      name: taxCode?.name ?? "Unclassified",
      currency: line.bill.currency,
      taxableAmount: taxable,
      taxAmount: tax,
    };
    if (scheduleType === "FX") schedules.foreignCurrency.push(scheduleItem);
    if (scheduleType === "RTGS") schedules.rtgs.push(scheduleItem);
    if (scheduleType === "WITHHOLDING") schedules.withholding.push(scheduleItem);
  }

  const rows = Array.from(rowMap.values())
    .map((row) => ({
      ...row,
      netTax: toMoney(row.outputTax - row.inputTax + row.adjustments),
    }))
    .sort((a, b) => `${a.code}`.localeCompare(`${b.code}`));

  const adjustmentsTax = toMoney(input.adjustmentsTax ?? 0);
  vat7Boxes.outputAdjustmentsTax = toMoney(vat7Boxes.outputAdjustmentsTax + adjustmentsTax);

  const totals = rows.reduce(
    (acc, row) => ({
      outputTax: toMoney(acc.outputTax + row.outputTax),
      inputTax: toMoney(acc.inputTax + row.inputTax),
      adjustmentsTax,
      netTax: toMoney(acc.netTax + row.netTax),
    }),
    {
      outputTax: 0,
      inputTax: 0,
      adjustmentsTax,
      netTax: 0,
    },
  );

  totals.netTax = toMoney(totals.netTax + adjustmentsTax);

  vat7Boxes.vatWithheldTax = toMoney(
    vat7Boxes.vatWithheldTax + schedules.withholding.reduce((sum, item) => sum + item.taxAmount, 0),
  );
  vat7Boxes.totalOutputTax = toMoney(totals.outputTax + adjustmentsTax);
  vat7Boxes.totalInputTax = toMoney(totals.inputTax + vat7Boxes.vatWithheldTax);

  const netTaxAfterWithholding = toMoney(vat7Boxes.totalOutputTax - vat7Boxes.totalInputTax);
  if (netTaxAfterWithholding >= 0) {
    vat7Boxes.vatPayable = netTaxAfterWithholding;
    vat7Boxes.vatRefundable = 0;
  } else {
    vat7Boxes.vatPayable = 0;
    vat7Boxes.vatRefundable = Math.abs(netTaxAfterWithholding);
  }

  return { rows, totals, vat7Boxes, schedules } satisfies VatComputationResult;
}

export async function createOrRefreshVatReturnDraft(input: {
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  notes?: string | null;
  preparedById?: string | null;
  adjustmentsTax?: number;
  filingCategory?: string | null;
}) {
  const computed = await computeVatReturnSnapshot({
    companyId: input.companyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    adjustmentsTax: input.adjustmentsTax,
  });

  const existing = await prisma.vatReturn.findUnique({
    where: {
      companyId_periodStart_periodEnd: {
        companyId: input.companyId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    },
    select: { id: true, status: true },
  });

  if (existing && !["DRAFT", "REVIEWED"].includes(existing.status)) {
    throw new Error("VAT return is already finalized or filed for this period.");
  }

  const returnDueDate = getDueDate(input.periodEnd, 10);
  const paymentDueDate = getDueDate(input.periodEnd, 15);

  if (existing) {
    return prisma.$transaction(async (tx) => {
      await tx.vatReturnLine.deleteMany({ where: { vatReturnId: existing.id } });
      return tx.vatReturn.update({
        where: { id: existing.id },
        data: {
          status: "DRAFT",
          filingCategory: input.filingCategory ?? "GENERAL",
          returnDueDate,
          paymentDueDate,
          outputTax: computed.totals.outputTax,
          inputTax: computed.totals.inputTax,
          adjustmentsTax: computed.totals.adjustmentsTax,
          netTax: computed.totals.netTax,
          vat7BoxesJson: JSON.stringify(computed.vat7Boxes),
          schedulesJson: JSON.stringify(computed.schedules),
          notes: input.notes ?? undefined,
          preparedById: input.preparedById ?? undefined,
          lines: {
            create: computed.rows.map((row) => ({
              taxCodeId: row.taxCodeId ?? undefined,
              code: row.code,
              name: row.name,
              rate: row.rate,
              taxableAmount: row.taxableAmount,
              outputTax: row.outputTax,
              inputTax: row.inputTax,
              adjustments: row.adjustments,
              netTax: row.netTax,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  return prisma.vatReturn.create({
    data: {
      companyId: input.companyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: "DRAFT",
      filingCategory: input.filingCategory ?? "GENERAL",
      returnDueDate,
      paymentDueDate,
      outputTax: computed.totals.outputTax,
      inputTax: computed.totals.inputTax,
      adjustmentsTax: computed.totals.adjustmentsTax,
      netTax: computed.totals.netTax,
      vat7BoxesJson: JSON.stringify(computed.vat7Boxes),
      schedulesJson: JSON.stringify(computed.schedules),
      notes: input.notes ?? undefined,
      preparedById: input.preparedById ?? undefined,
      lines: {
        create: computed.rows.map((row) => ({
          taxCodeId: row.taxCodeId ?? undefined,
          code: row.code,
          name: row.name,
          rate: row.rate,
          taxableAmount: row.taxableAmount,
          outputTax: row.outputTax,
          inputTax: row.inputTax,
          adjustments: row.adjustments,
          netTax: row.netTax,
        })),
      },
    },
    include: { lines: true },
  });
}

export async function transitionVatReturnStatus(input: {
  companyId: string;
  vatReturnId: string;
  nextStatus: "REVIEWED" | "FINALIZED" | "FILED" | "VOIDED" | "DRAFT";
  actorId?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
}) {
  const current = await prisma.vatReturn.findUnique({
    where: { id: input.vatReturnId },
  });
  if (!current || current.companyId !== input.companyId) {
    throw new Error("VAT return not found");
  }
  if (!ensureVatTransition(current.status, input.nextStatus)) {
    throw new Error(`Invalid VAT return status transition from ${current.status} to ${input.nextStatus}`);
  }

  return prisma.vatReturn.update({
    where: { id: current.id },
    data: {
      status: input.nextStatus,
      notes: input.notes ?? undefined,
      ...(input.nextStatus === "REVIEWED"
        ? { reviewedById: input.actorId ?? undefined, reviewedAt: new Date() }
        : {}),
      ...(input.nextStatus === "FINALIZED"
        ? { finalizedById: input.actorId ?? undefined, finalizedAt: new Date() }
        : {}),
      ...(input.nextStatus === "FILED"
        ? {
            filedById: input.actorId ?? undefined,
            filedAt: new Date(),
            referenceNumber: input.referenceNumber ?? undefined,
          }
        : {}),
    },
    include: { lines: true },
  });
}

export function parseVatReturnPayload<T extends { vat7BoxesJson?: string | null; schedulesJson?: string | null }>(
  vatReturn: T,
) {
  const safeParse = (value?: string | null) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  return {
    ...vatReturn,
    vat7Boxes: safeParse(vatReturn.vat7BoxesJson),
    schedules: safeParse(vatReturn.schedulesJson),
  };
}
