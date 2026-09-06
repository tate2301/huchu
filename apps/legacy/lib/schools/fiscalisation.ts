/**
 * S-2.7 — a school on the ZIMRA add-on fiscalises the money it takes.
 *
 * The accounting module already speaks to FDMS: `lib/accounting/fdms-connector`
 * carries the mTLS transport and the retry policy, `lib/accounting/fiscalisation`
 * records what came back, and `/api/accounting/fiscalisation/replay` drains what
 * did not land. None of that is rebuilt here. What was missing was a way in for
 * a document that is not a `SalesInvoice`.
 *
 * ## What a school fiscalises, and why it is the receipt
 *
 * The roadmap row says the receipt, and the receipt is right for a school even
 * though FDMS's payload is invoice-shaped. A parent pays a term's fees in
 * instalments across three months; the tax point a family is handed a document
 * for is the moment the money changes hands, not the moment the bill was
 * raised. It also means a school that never issues a formal invoice — plenty
 * take fees against a printed fee schedule — still fiscalises everything it
 * collects.
 *
 * The cost of that choice is that a receipt has no line items of its own: it can
 * settle several invoices at once and it can carry a surplus that settles none.
 * So the lines are **derived from the allocations**, one per invoice the payment
 * touched, plus one for any credit left over. They sum to `amountReceived` by
 * construction, because each is an allocation and the last is the remainder.
 *
 * ## Failure mode: synchronous, and the receipt is never at risk
 *
 * Same as the sales-invoice path, deliberately — this is not the story to
 * introduce a queue the rest of the module does not have. The call is made in
 * the bursar's request, after the receipt's own transaction has committed, and
 * its outcome is reported back alongside the accounting outcome rather than
 * thrown. A school without the add-on never reaches the connector at all.
 *
 * Durability comes from ordering rather than from a worker: `issueFiscalDocument`
 * writes a PENDING `FiscalReceipt` row before it touches the network, so a
 * timeout or a crash leaves a row with an `attemptCount` and a `nextRetryAt`
 * that replay will find. Nothing here writes to `SchoolFeeReceipt`.
 */
import type { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import {
  issueFiscalDocument,
  type FiscalValidationResult,
} from "@/lib/accounting/fiscalisation";
import { hasFeature } from "@/lib/platform/features";
import { clampAtZero, money, sumMoney, toNumberOrZero } from "@/lib/schools/money";

/** The add-on a school buys. Sold as `ADDON_ZIMRA_FISCAL` in `lib/marketing/pricing.ts`. */
export const SCHOOL_FISCALISATION_FEATURE = "accounting.zimra.fiscalisation";

export type SchoolFiscalOutcome = {
  /**
   * `SKIPPED` is the ordinary answer for the vast majority of schools: the
   * add-on is not on, so nothing was attempted, nothing was queued and nothing
   * failed. It is deliberately not `FAILED` — a school that has not bought
   * fiscalisation has not got a problem.
   */
  fiscalStatus: "SKIPPED" | "SUCCESS" | "PENDING" | "FAILED";
  fiscalReceiptId: string | null;
  fiscalNumber: string | null;
  providerReference: string | null;
  /** Why it was skipped, or what went wrong. Null when it succeeded. */
  fiscalError: string | null;
  /** The fields a bursar has to fill in before this can work. */
  missing?: string[];
};

const SKIPPED: SchoolFiscalOutcome = {
  fiscalStatus: "SKIPPED",
  fiscalReceiptId: null,
  fiscalNumber: null,
  providerReference: null,
  fiscalError: null,
};

function skipped(reason: string): SchoolFiscalOutcome {
  return { ...SKIPPED, fiscalError: reason };
}

function failed(error: string, missing?: string[]): SchoolFiscalOutcome {
  return {
    fiscalStatus: "FAILED",
    fiscalReceiptId: null,
    fiscalNumber: null,
    providerReference: null,
    fiscalError: error,
    ...(missing ? { missing } : {}),
  };
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim();
}

/** The receipt, and everything the FDMS payload is built out of. */
const RECEIPT_INCLUDE = {
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      guardianLinks: {
        select: {
          isPrimary: true,
          canReceiveFinancials: true,
          relationship: true,
          guardian: {
            select: {
              id: true,
              guardianNo: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
              address: true,
              nationalId: true,
            },
          },
        },
      },
    },
  },
  allocations: {
    select: {
      allocatedAmount: true,
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          subTotal: true,
          taxTotal: true,
          totalAmount: true,
          term: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" as const }],
  },
} satisfies Prisma.SchoolFeeReceiptInclude;

type FiscalisableReceipt = Prisma.SchoolFeeReceiptGetPayload<{
  include: typeof RECEIPT_INCLUDE;
}>;

type GuardianLink = FiscalisableReceipt["student"]["guardianLinks"][number];

/**
 * Who the fiscal receipt is made out to.
 *
 * The fee-payer, not the child. A student has no billing address and is very
 * often a minor; the guardian marked as receiving financials is the person the
 * money came from and the person a tax document belongs to. Preference order:
 * the primary financial guardian, then any financial guardian, then the primary
 * guardian, then whoever is on file. A student with no guardian record at all
 * falls back to the student's own name, which fails validation on the address
 * and says so.
 */
export function resolveFiscalCustomer(receipt: FiscalisableReceipt) {
  const links = receipt.student.guardianLinks;
  const rank = (link: GuardianLink) =>
    (link.canReceiveFinancials ? 0 : 2) + (link.isPrimary ? 0 : 1);
  const chosen = [...links].sort((a, b) => rank(a) - rank(b))[0]?.guardian ?? null;

  if (!chosen) {
    return {
      name: `${receipt.student.firstName} ${receipt.student.lastName}`.trim(),
      reference: receipt.student.studentNo,
      taxNumber: null as string | null,
      vatNumber: null as string | null,
      address: null as string | null,
      phone: null as string | null,
      email: null as string | null,
    };
  }

  return {
    name: `${chosen.firstName} ${chosen.lastName}`.trim(),
    reference: chosen.guardianNo,
    taxNumber: chosen.nationalId,
    vatNumber: null as string | null,
    address: chosen.address,
    phone: chosen.phone,
    email: chosen.email,
  };
}

export type FiscalLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
};

/**
 * The lines of a receipt, derived from what the payment settled.
 *
 * Tax is apportioned from the invoice, not recomputed: settling half a bill
 * carries half its VAT. The share is taken against the invoice **gross**, so a
 * receipt that clears an invoice in full reproduces that invoice's tax exactly,
 * and a part payment splits it in the ratio the money did.
 *
 * The unallocated surplus is a separate line at zero tax. It is a deposit —
 * money held against no supply yet made — and taxing it would declare output
 * VAT the school does not owe until the credit is spent, at which point the
 * invoice it settles declares it.
 */
export function buildFiscalLines(receipt: FiscalisableReceipt): FiscalLine[] {
  const lines: FiscalLine[] = [];

  for (const allocation of receipt.allocations) {
    const gross = money(allocation.allocatedAmount);
    if (!gross.greaterThan(0)) continue;

    const invoiceTotal = money(allocation.invoice.totalAmount);
    const invoiceTax = money(allocation.invoice.taxTotal);
    const taxAmount = invoiceTotal.greaterThan(0)
      ? money(gross.times(invoiceTax).dividedBy(invoiceTotal))
      : money(0);
    const net = money(gross.minus(taxAmount));
    const taxRate = net.greaterThan(0)
      ? money(taxAmount.times(100).dividedBy(net))
      : money(0);

    const term = normalize(allocation.invoice.term?.name);
    lines.push({
      description: term
        ? `School fees ${allocation.invoice.invoiceNo} — ${term}`
        : `School fees ${allocation.invoice.invoiceNo}`,
      quantity: 1,
      unitPrice: toNumberOrZero(gross),
      taxRate: toNumberOrZero(taxRate),
      taxAmount: toNumberOrZero(taxAmount),
      lineTotal: toNumberOrZero(gross),
    });
  }

  const surplus = clampAtZero(receipt.amountUnallocated);
  if (surplus.greaterThan(0)) {
    lines.push({
      description: "Payment on account — credit held for future fees",
      quantity: 1,
      unitPrice: toNumberOrZero(surplus),
      taxRate: 0,
      taxAmount: 0,
      lineTotal: toNumberOrZero(surplus),
    });
  }

  return lines;
}

type Supplier = {
  legalName: string | null;
  tradingName: string | null;
  vatNumber: string | null;
  taxNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
} | null;

/**
 * Everything FDMS is told about one school fee receipt.
 *
 * Shaped like the sales-invoice payload on purpose — the connector posts
 * whatever object it is handed, and a provider integration written against one
 * shape should not have to learn a second.
 */
export function buildSchoolFeeReceiptPayload(input: {
  receipt: FiscalisableReceipt;
  supplier: Supplier;
}) {
  const { receipt, supplier } = input;
  const lines = buildFiscalLines(receipt);
  // Summed in Decimal and subtracted in Decimal. These are cent-exact figures
  // and a float accumulation across twenty allocation lines is how a fiscal
  // receipt ends up a cent away from the money in the tin.
  const taxTotal = sumMoney(lines.map((line) => line.taxAmount));
  const total = money(receipt.amountReceived);

  return {
    documentType: "SCHOOL_FEE_RECEIPT",
    invoiceNumber: receipt.receiptNo,
    invoiceDate: receipt.receiptDate,
    currency: receipt.currency,
    totals: {
      // Derived from the lines, which are themselves derived from the
      // allocations, so the parts add up to the whole the parent handed over.
      subTotal: toNumberOrZero(total.minus(taxTotal)),
      taxTotal: toNumberOrZero(taxTotal),
      total: toNumberOrZero(total),
    },
    payment: {
      method: receipt.paymentMethod,
      reference: receipt.reference,
    },
    supplier,
    customer: resolveFiscalCustomer(receipt),
    student: {
      studentNo: receipt.student.studentNo,
      name: `${receipt.student.firstName} ${receipt.student.lastName}`.trim(),
    },
    items: lines,
  };
}

async function loadReceipt(companyId: string, receiptId: string) {
  return prisma.schoolFeeReceipt.findFirst({
    where: { id: receiptId, companyId },
    include: RECEIPT_INCLUDE,
  });
}

async function loadSupplier(companyId: string): Promise<Supplier> {
  return prisma.accountingSettings.findUnique({
    where: { companyId },
    select: {
      legalName: true,
      tradingName: true,
      vatNumber: true,
      taxNumber: true,
      address: true,
      phone: true,
      email: true,
    },
  });
}

/**
 * What is still missing before this receipt can be fiscalised.
 *
 * The same checks `validateFiscalInvoice` makes of a sales invoice, asked of a
 * school fee receipt. A provisioned school gets an `AccountingSettings` row from
 * the seed pack but none of its ZIMRA identity, so the first honest answer for
 * most tenants is the four supplier fields — which is exactly what a bursar
 * needs to be told.
 */
export function validateSchoolFeeReceipt(input: {
  receipt: FiscalisableReceipt;
  supplier: Supplier;
}): FiscalValidationResult {
  const { receipt, supplier } = input;
  const missing: string[] = [];

  if (!supplier) {
    missing.push("accounting settings");
  } else {
    if (!normalize(supplier.legalName)) missing.push("supplier legal name");
    if (!normalize(supplier.vatNumber)) missing.push("supplier VAT number");
    if (!normalize(supplier.taxNumber)) missing.push("supplier tax number");
    if (!normalize(supplier.address)) missing.push("supplier address");
  }

  if (!normalize(receipt.receiptNo)) missing.push("receipt number");
  if (!receipt.receiptDate) missing.push("receipt date");
  if (!normalize(receipt.currency)) missing.push("currency");

  const customer = resolveFiscalCustomer(receipt);
  if (!normalize(customer.name)) missing.push("fee payer name");
  if (!normalize(customer.address)) missing.push("fee payer address");

  const lines = buildFiscalLines(receipt);
  if (lines.length === 0) missing.push("receipt line items");

  return { ok: missing.length === 0, missing };
}

/**
 * Read-only: what would happen if this receipt were fiscalised now.
 *
 * Used by the routes to answer a bursar before anything is sent, and by tests.
 */
export async function inspectSchoolFeeReceiptFiscalisation(input: {
  companyId: string;
  receiptId: string;
}): Promise<
  | { ok: false; reason: string; missing?: string[] }
  | { ok: true; receipt: FiscalisableReceipt; payload: Record<string, unknown> }
> {
  const [receipt, supplier] = await Promise.all([
    loadReceipt(input.companyId, input.receiptId),
    loadSupplier(input.companyId),
  ]);
  if (!receipt) return { ok: false, reason: "Fee receipt not found" };
  if (receipt.status !== "POSTED") {
    return {
      ok: false,
      reason: `A ${receipt.status.toLowerCase()} receipt cannot be fiscalised`,
    };
  }

  const validation = validateSchoolFeeReceipt({ receipt, supplier });
  if (!validation.ok) {
    return {
      ok: false,
      reason: `Missing fiscal fields: ${validation.missing.join(", ")}`,
      missing: validation.missing,
    };
  }

  return {
    ok: true,
    receipt,
    payload: buildSchoolFeeReceiptPayload({ receipt, supplier }),
  };
}

/**
 * Fiscalise a posted school fee receipt, if this school has the add-on.
 *
 * Never throws for a fiscalisation problem: every outcome is a value, because
 * the caller is a bursar's payment request and the payment has already
 * happened. A tenant without the feature returns `SKIPPED` before a single
 * further query is made.
 */
export async function issueSchoolFeeReceiptFiscalisation(input: {
  companyId: string;
  receiptId: string;
}): Promise<SchoolFiscalOutcome> {
  const enabled = await hasFeature(input.companyId, SCHOOL_FISCALISATION_FEATURE);
  if (!enabled) return skipped("Fiscalisation is not enabled for this school");

  const inspected = await inspectSchoolFeeReceiptFiscalisation(input);
  if (!inspected.ok) return failed(inspected.reason, inspected.missing);

  const result = await issueFiscalDocument({
    companyId: input.companyId,
    source: { kind: "SCHOOL_FEE_RECEIPT", schoolReceiptId: inspected.receipt.id },
    documentNumber: inspected.receipt.receiptNo,
    // Namespaced, because a school receipt id and a sales invoice id are both
    // uuids and the provider sees only this string.
    idempotencyKey: `${input.companyId}:school-fee-receipt:${inspected.receipt.id}`,
    payload: inspected.payload,
  });

  return {
    fiscalStatus: result.status,
    fiscalReceiptId: result.receiptId ?? null,
    fiscalNumber: result.fiscalNumber ?? null,
    providerReference: result.providerReference ?? null,
    fiscalError: result.error ?? null,
  };
}

/**
 * As above, but never lets a fiscalisation defect reach the caller as an
 * exception. This is what the receipt route uses: the money is already taken and
 * committed, and no failure here may turn a successful payment into a 500.
 */
export async function tryIssueSchoolFeeReceiptFiscalisation(input: {
  companyId: string;
  receiptId: string;
}): Promise<SchoolFiscalOutcome> {
  try {
    return await issueSchoolFeeReceiptFiscalisation(input);
  } catch (error) {
    console.error("[Fiscalisation] School fee receipt fiscalisation failed:", error);
    return failed(
      error instanceof Error ? error.message : "Fiscalisation failed",
    );
  }
}
