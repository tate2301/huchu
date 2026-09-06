import {
  Prisma,
  type AccountingSourceType,
  type SchoolFeeInvoiceStatus,
} from "@corelithzw/db";
import { createJournalEntryFromSource } from "@corelithzw/module-books/posting";
import {
  clampAtZero,
  isZeroOrLess,
  isPositive,
  minMoney,
  money,
  type MoneyLike,
  sumMoney,
  toBaseAmount,
  toNumberOrZero,
} from "@/lib/schools/money";

/**
 * S-2.4 — the partial unique index that stops a student being invoiced twice
 * for one term against one fee structure.
 *
 * It cannot live in `schema.prisma` (Prisma has no `WHERE` on `@@unique`), so
 * the name is written down once here and matched against what Postgres reports.
 * A voided invoice is outside the index; so is an ad-hoc invoice with no fee
 * structure, because `feeStructureId` is nullable and NULLs are distinct.
 */
export const LIVE_FEE_INVOICE_INDEX =
  "SchoolFeeInvoice_live_student_term_structure_key";

/**
 * The columns the index covers, in the order Postgres reports them.
 *
 * Prisma does not surface the index *name* for a P2002 raised by an index it
 * does not know about — it reports the column list instead — so that is what is
 * matched. No other unique constraint on `SchoolFeeInvoice` covers these four,
 * so the match is unambiguous.
 */
const LIVE_FEE_INVOICE_COLUMNS = [
  "companyid",
  "studentid",
  "termid",
  "feestructureid",
];

export function isDuplicateLiveInvoice(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const named = (
    Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : error.message
  ).toLowerCase();

  if (named.includes(LIVE_FEE_INVOICE_INDEX.toLowerCase())) return true;
  return LIVE_FEE_INVOICE_COLUMNS.every((column) => named.includes(column));
}

export type SchoolFeeAccountingEventType =
  | "SCHOOL_FEE_INVOICE_ISSUED"
  | "SCHOOL_FEE_RECEIPT_POSTED"
  | "SCHOOL_FEE_RECEIPT_VOIDED"
  | "SCHOOL_FEE_CREDIT_APPLIED"
  | "SCHOOL_FEE_REFUND_PAID"
  | "SCHOOL_FEE_WAIVER_APPLIED"
  | "SCHOOL_FEE_WRITEOFF_POSTED";

/**
 * S-2.3 — which account was holding the credit a refund is paying out.
 *
 * `RECEIPT` is a surplus on a receipt: money taken that no invoice claimed, and
 * therefore sitting in Fees Received In Advance. `INVOICE` is an over-settled
 * invoice — nearly always a bursary applied to a bill the family had already
 * paid — which sits as a credit balance in School Fees Receivable. Refunding
 * one is not the same journal entry as refunding the other.
 */
export type SchoolFeeCreditSource = "RECEIPT" | "INVOICE";

type SchoolFeeAccountingEventInput = {
  companyId: string;
  actorId: string;
  eventType: SchoolFeeAccountingEventType;
  sourceId: string;
  sourceRef: string;
  entryDate: Date;
  /**
   * Post-S-2.1 these are `Prisma.Decimal` at every real call site. They are
   * coerced to `number` once, here, because that is what `PostingContext`
   * takes; do not do arithmetic on them before handing them over.
   *
   * Post-S-2.2 they are expected **in the company's base currency** — see
   * `documentCurrency` below.
   */
  amount: MoneyLike;
  netAmount?: MoneyLike;
  taxAmount?: MoneyLike;
  grossAmount?: MoneyLike;
  /**
   * The currency the ledger entry is denominated in. The posting engine does no
   * conversion — it stamps whatever it is given onto the journal entry — so
   * this must be the company's base currency and `amount` must already be the
   * base-currency figure. A school billing in ZWG passes `baseAmount` here and
   * records the ZWG side through `documentCurrency` / `documentAmount`, which
   * travel in the payload for S-2.3 to make proper use of.
   */
  currency?: string;
  documentCurrency?: string;
  documentAmount?: MoneyLike;
  exchangeRate?: MoneyLike;
  /**
   * S-2.3 — how a receipt's money splits, **in base currency**.
   *
   * The part that settles a bill credits School Fees Receivable; the rest is
   * the family's credit and belongs in Fees Received In Advance until an
   * invoice claims it. Only this figure is passed: the surplus is derived as
   * `amount − allocatedAmount`, so the two can never fail to add up and the
   * entry can never come out unbalanced. Omitted means the whole receipt
   * settled bills, which is the ordinary case.
   *
   * Use `apportionBase` to produce it — converting the allocated and
   * unallocated halves separately loses a cent on a non-base currency.
   */
  allocatedAmount?: MoneyLike;
  /** Required on `SCHOOL_FEE_REFUND_PAID`. Defaults to the receipt surplus. */
  creditSource?: SchoolFeeCreditSource;
  payload?: Record<string, unknown>;
  invertDirection?: boolean;
  version?: number;
  /** Lets a period-lock override be attributed. Null for ordinary postings. */
  actorRole?: string | null;
};

/**
 * S-2.3 — the seam is closed. Every school fee event posts under its own kind.
 *
 * These used to borrow retail's: an invoice was a `SALES_INVOICE`, a receipt
 * and its void were both `SALES_RECEIPT`, and a bursary waiver shared
 * `SALES_WRITE_OFF` with genuinely uncollectable fees. The consequences were
 * visible in the trial balance — tuition credited to "Retail Sales Revenue",
 * scholarships charged to "Bad Debt Expense" — and invisible in a drill-down,
 * which never said the entry came from a school at all.
 *
 * The posting source ids did not change, so every journal entry already written
 * keeps its idempotency key. What changes is the rule each one resolves
 * against; `SCHOOLS_POSTING_RULES` seeds one per member.
 */
function toPostingSourceType(
  eventType: SchoolFeeAccountingEventType,
): AccountingSourceType {
  switch (eventType) {
    case "SCHOOL_FEE_INVOICE_ISSUED":
      return "SCHOOL_FEE_INVOICE";
    case "SCHOOL_FEE_RECEIPT_POSTED":
      return "SCHOOL_FEE_RECEIPT";
    case "SCHOOL_FEE_RECEIPT_VOIDED":
      return "SCHOOL_FEE_RECEIPT_VOID";
    case "SCHOOL_FEE_CREDIT_APPLIED":
      return "SCHOOL_FEE_CREDIT_APPLIED";
    case "SCHOOL_FEE_REFUND_PAID":
      return "SCHOOL_FEE_REFUND";
    case "SCHOOL_FEE_WAIVER_APPLIED":
      return "SCHOOL_FEE_WAIVER";
    case "SCHOOL_FEE_WRITEOFF_POSTED":
      return "SCHOOL_FEE_WRITE_OFF";
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
  if (input.eventType === "SCHOOL_FEE_REFUND_PAID") {
    return `SCHOOL_FEE_REFUND:${input.sourceId}`;
  }
  if (input.eventType === "SCHOOL_FEE_CREDIT_APPLIED") {
    // The caller makes this unique per application — a receipt's credit can be
    // spent more than once, so the receipt id alone would collide and the
    // second application would be swallowed as a duplicate of the first.
    return `SCHOOL_FEE_CREDIT:${input.sourceId}`;
  }
  return `SCHOOL_FEE_RECEIPT:${input.sourceId}`;
}

/**
 * Failures that mean "not yet", not "never".
 *
 * A locked period is the ordinary case of a receipt taken after month end. The
 * event stays PENDING and `retryPendingAccountingEvents` — the same drain the
 * replay endpoint and `pnpm platform:accounting-replay` use — posts it once the
 * period reopens. Anything else is a real posting failure and is surfaced.
 */
const PENDING_POSTING_CODES = new Set([
  "PERIOD_LOCKED",
  "PERIOD_OVERRIDE_FORBIDDEN",
  "PERIOD_OVERRIDE_REASON_REQUIRED",
]);

/**
 * S-2.3 — the figures the seeded rules read by `valuePath`, derived here so no
 * call site can produce a set that does not add up.
 *
 * Three of the seven rules split one amount across two lines. Both halves come
 * from a single number: one is given, the other is `amount − given`. That is
 * what makes the entry balance whatever the caller passes — the alternative,
 * two independently converted figures, is a cent apart on any non-base currency
 * and the posting is refused.
 *
 * Every key is a plain `number`, because the payload is JSON-serialised into
 * `AccountingIntegrationEvent.payloadJson` and a `Prisma.Decimal` dropped in
 * here would be stored as a string — which `getPathValue` then ignores, taking
 * the line's basis instead.
 */
function buildPostingSplit(
  input: SchoolFeeAccountingEventInput,
): Record<string, number> {
  const amount = money(input.amount);

  if (
    input.eventType === "SCHOOL_FEE_RECEIPT_POSTED" ||
    input.eventType === "SCHOOL_FEE_RECEIPT_VOIDED"
  ) {
    const allocated = minMoney(
      clampAtZero(money(input.allocatedAmount ?? amount)),
      clampAtZero(amount),
    );
    return {
      allocatedBaseAmount: toNumberOrZero(allocated),
      unallocatedBaseAmount: toNumberOrZero(clampAtZero(amount.minus(allocated))),
    };
  }

  if (input.eventType === "SCHOOL_FEE_REFUND_PAID") {
    const fromReceivable = input.creditSource === "INVOICE";
    return {
      refundFromAdvanceBaseAmount: fromReceivable ? 0 : toNumberOrZero(amount),
      refundFromReceivableBaseAmount: fromReceivable ? toNumberOrZero(amount) : 0,
    };
  }

  return {};
}

export type SchoolFeePostingResult = {
  accountingStatus: "POSTED" | "PENDING" | "FAILED";
  journalEntryId: string | null;
  accountingError: string | null;
};

/**
 * Post a school fee event to the ledger.
 *
 * This used to call `captureAccountingEvent` and stop, which wrote an
 * `AccountingIntegrationEvent` with status PENDING and produced no journal
 * entry. The only things that turned those rows into ledger movements were the
 * replay endpoint and a CLI, both run by hand — so fee income, the pack's whole
 * wedge, sat outside the trial balance until somebody remembered.
 *
 * It now does what retail's `postRetailJournal` does: posts inline through
 * `createJournalEntryFromSource`, which creates the integration event itself,
 * resolves the posting rule, writes the balanced entry and syncs the AR
 * subledger. Idempotency is unchanged — the source id is still
 * `SCHOOL_FEE_RECEIPT:{id}` and friends, so a repeated call returns the
 * existing entry rather than a second one.
 */
export async function emitSchoolFeeAccountingEvent(
  input: SchoolFeeAccountingEventInput,
): Promise<SchoolFeePostingResult> {
  const sourceType = toPostingSourceType(input.eventType);
  const postingSourceId = buildPostingSourceId({
    eventType: input.eventType,
    sourceId: input.sourceId,
  });
  const version = input.version ?? 1;
  const idempotencyKey = `schools:${input.eventType}:${input.sourceId}:v${version}`;

  const result = await createJournalEntryFromSource({
    companyId: input.companyId,
    sourceType,
    sourceId: postingSourceId,
    entryDate: input.entryDate,
    description: `${input.eventType} (${input.sourceRef})`,
    createdById: input.actorId,
    // Post S-2.1 Float→Decimal: these arrive as `Prisma.Decimal`. Coerced once
    // here because `PostingContext` is a number contract.
    amount: toNumberOrZero(money(input.amount)),
    netAmount: toNumberOrZero(money(input.netAmount)),
    taxAmount: toNumberOrZero(money(input.taxAmount)),
    grossAmount: toNumberOrZero(money(input.grossAmount ?? input.amount)),
    currency: input.currency ?? "USD",
    actorRole: input.actorRole ?? null,
    invertDirection: input.invertDirection === true,
    payload: {
      idempotencyKey,
      eventType: input.eventType,
      sourceRef: input.sourceRef,
      sourceId: input.sourceId,
      postingSourceId,
      // S-2.2. The ledger carries the base-currency figure; what the family was
      // actually billed travels alongside it so nothing has to be re-derived
      // from a rate that may since have moved.
      documentCurrency: input.documentCurrency ?? input.currency ?? "USD",
      documentAmount: toNumberOrZero(money(input.documentAmount ?? input.amount)),
      exchangeRate: toNumberOrZero(input.exchangeRate ?? 1),
      ...buildPostingSplit(input),
      ...input.payload,
    },
  });

  if (result.entryId || result.skipped) {
    return {
      accountingStatus: "POSTED",
      journalEntryId: result.entryId ?? null,
      accountingError: null,
    };
  }

  return {
    accountingStatus: PENDING_POSTING_CODES.has(result.code ?? "") ? "PENDING" : "FAILED",
    journalEntryId: null,
    accountingError: result.error ?? "Accounting posting failed",
  };
}

export function recalculateFeeInvoiceStatus(input: {
  currentStatus: string;
  totalAmount: MoneyLike;
  paidAmount: MoneyLike;
  waivedAmount: MoneyLike;
  writeOffAmount: MoneyLike;
  balanceAmount: MoneyLike;
}) {
  const current = input.currentStatus;
  if (current === "VOIDED" || current === "WRITEOFF") return current;
  if (isZeroOrLess(input.totalAmount)) return "DRAFT";
  if (isZeroOrLess(input.balanceAmount)) return "PAID";
  if (
    isPositive(input.paidAmount) ||
    isPositive(input.waivedAmount) ||
    isPositive(input.writeOffAmount)
  ) {
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
        exchangeRate: true,
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

  // Post S-2.1 Float→Decimal: every one of these columns is a `Prisma.Decimal`,
  // and the sums stay Decimal from the read to the write. A hundred invoice
  // lines accumulated with `+=` on a double is exactly the drift the migration
  // exists to end.
  const subTotal = sumMoney(
    lines.map((line) => clampAtZero(money(line.lineTotal).minus(money(line.taxAmount)))),
  );
  const taxTotal = sumMoney(lines.map((line) => line.taxAmount));
  const totalAmount = sumMoney(lines.map((line) => line.lineTotal));
  const paidAmount = sumMoney(allocations.map((allocation) => allocation.allocatedAmount));
  const waivedAmount = sumMoney(waivers.map((waiver) => waiver.amount));
  const settled = paidAmount.plus(waivedAmount);
  const writeOffAmount =
    invoice.status === "WRITEOFF" ? clampAtZero(totalAmount.minus(settled)) : money(0);
  const balanceAmount = clampAtZero(totalAmount.minus(settled).minus(writeOffAmount));
  // S-2.5. `balanceAmount` is clamped at zero, and before this line the clamp
  // was where an over-settled invoice quietly lost the difference — most often
  // a bursary applied to a bill the family had already paid in full. The two
  // are mirror images of one another and never both positive, which is what the
  // `SchoolFeeInvoice_credit_xor_balance_check` constraint asserts.
  const creditAmount = clampAtZero(
    settled.plus(writeOffAmount).minus(totalAmount),
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
      creditAmount,
      // S-2.2. The base-currency equivalent is derived, never entered, so it
      // cannot disagree with the total it restates.
      baseAmount: toBaseAmount(totalAmount, invoice.exchangeRate),
      status: nextStatus as SchoolFeeInvoiceStatus,
    },
  });
}

/**
 * A refusal a bursar can act on.
 *
 * The fee routes report failures through `errorResponse`, and a thrown `Error`
 * inside a transaction would come back as an anonymous 500. This carries the
 * status with it so the transaction can be aborted by throwing — which is the
 * only way to abort one — without losing the sentence.
 */
export class FeeCreditError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "FeeCreditError";
  }
}

/**
 * A CHECK constraint said no.
 *
 * The credit and refund caps are held by the database (see the S-2.5/S-2.6
 * migration), so the last word on "is there enough" is a constraint violation
 * rather than a branch. Prisma surfaces these as an unknown request error with
 * the constraint name in the message, so that is what is matched. The service
 * layer checks the same thing first and produces a better sentence; this is the
 * backstop for the case the service layer cannot win — two bursars, one credit,
 * the same instant.
 */
export function isFeeCreditCheckViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (!message.includes("violates check constraint")) return false;
  return (
    message.includes("refunded_within") ||
    message.includes("split_adds_up") ||
    message.includes("credit_xor_balance") ||
    message.includes("schoolfeereceiptallocation_positive")
  );
}

/**
 * Take the row locks before reading the balances the decision rests on.
 *
 * S-2.5's "validated inside the transaction" is not satisfied by moving the
 * `findMany` inside the `$transaction` callback: Postgres's default READ
 * COMMITTED isolation would still let two bursars each read a $450 balance and
 * each allocate $450 against it. `FOR UPDATE` is what serialises them, and
 * ordering by id is what stops two overlapping allocations deadlocking each
 * other.
 */
export async function lockFeeInvoices(
  tx: Prisma.TransactionClient,
  input: { companyId: string; invoiceIds: string[] },
): Promise<void> {
  if (input.invoiceIds.length === 0) return;
  await tx.$queryRaw`
    SELECT "id" FROM "SchoolFeeInvoice"
    WHERE "companyId" = ${input.companyId}
      AND "id" IN (${Prisma.join(input.invoiceIds)})
    ORDER BY "id"
    FOR UPDATE
  `;
}

/** As `lockFeeInvoices`, for the receipt whose credit is being spent. */
export async function lockFeeReceipt(
  tx: Prisma.TransactionClient,
  input: { companyId: string; receiptId: string },
): Promise<void> {
  await tx.$queryRaw`
    SELECT "id" FROM "SchoolFeeReceipt"
    WHERE "companyId" = ${input.companyId} AND "id" = ${input.receiptId}
    FOR UPDATE
  `;
}

/**
 * Restate a receipt's split from its allocation rows.
 *
 * `amountAllocated + amountUnallocated = amountReceived` is a CHECK constraint,
 * so this is the only shape of write that can commit. The surplus is whatever
 * is left — it is never clamped, and there is nowhere for it to go but the
 * family's credit.
 */
export async function refreshFeeReceiptSplit(
  tx: Prisma.TransactionClient,
  input: { companyId: string; receiptId: string },
) {
  const { companyId, receiptId } = input;
  const [receipt, allocations] = await Promise.all([
    tx.schoolFeeReceipt.findFirst({
      where: { id: receiptId, companyId },
      select: { id: true, amountReceived: true, refundedAmount: true },
    }),
    tx.schoolFeeReceiptAllocation.findMany({
      where: { companyId, receiptId },
      select: { allocatedAmount: true },
    }),
  ]);
  if (!receipt) return null;

  const amountAllocated = sumMoney(
    allocations.map((allocation) => allocation.allocatedAmount),
  );
  const amountUnallocated = money(receipt.amountReceived).minus(amountAllocated);
  if (amountUnallocated.isNegative()) {
    throw new FeeCreditError("Allocations exceed the amount received", 400);
  }
  if (money(receipt.refundedAmount).greaterThan(amountUnallocated)) {
    throw new FeeCreditError(
      "That credit is already promised to a refund; cancel the refund first",
      409,
    );
  }

  return tx.schoolFeeReceipt.update({
    where: { id: receiptId },
    data: { amountAllocated, amountUnallocated },
  });
}

export type FeeAllocationInput = { invoiceId: string; allocatedAmount: MoneyLike };

type LockedInvoice = {
  id: string;
  invoiceNo: string;
  studentId: string;
  status: string;
  balanceAmount: Prisma.Decimal;
  currency: string;
};

/**
 * Read the invoices an allocation names, under lock, and refuse the ones that
 * cannot legally take money.
 *
 * Returns them keyed by id so the caller does not read them twice.
 */
export async function loadInvoicesForAllocation(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    studentId: string;
    currency: string;
    invoiceIds: string[];
  },
): Promise<Map<string, LockedInvoice>> {
  const invoiceIds = [...new Set(input.invoiceIds)];
  if (invoiceIds.length !== input.invoiceIds.length) {
    throw new FeeCreditError("Duplicate invoice allocations are not allowed", 400);
  }
  await lockFeeInvoices(tx, { companyId: input.companyId, invoiceIds });

  const invoices = await tx.schoolFeeInvoice.findMany({
    where: { companyId: input.companyId, id: { in: invoiceIds } },
    select: {
      id: true,
      invoiceNo: true,
      studentId: true,
      status: true,
      balanceAmount: true,
      currency: true,
    },
  });
  if (invoices.length !== invoiceIds.length) {
    throw new FeeCreditError("One or more allocated invoices are invalid", 400);
  }

  for (const invoice of invoices) {
    if (invoice.studentId !== input.studentId) {
      throw new FeeCreditError("One or more allocated invoices are invalid", 400);
    }
    if (invoice.status === "VOIDED" || invoice.status === "WRITEOFF") {
      throw new FeeCreditError(
        `Invoice ${invoice.invoiceNo} is voided or written off and cannot take a payment`,
        400,
      );
    }
    if (invoice.currency !== input.currency) {
      throw new FeeCreditError(
        `Invoice ${invoice.invoiceNo} is in ${invoice.currency}; money cannot be allocated across a currency boundary`,
        400,
      );
    }
  }

  return new Map(invoices.map((invoice) => [invoice.id, invoice]));
}

/**
 * Spread an amount over invoices oldest-first, stopping when it runs out.
 *
 * This is what makes an overpayment a credit rather than a refusal: given $500
 * and a $450 bill it produces one $450 allocation and hands back $50, where the
 * previous single-invoice path simply returned "allocation exceeds invoice
 * outstanding balance" and the parent's money could not be taken at all.
 */
export function spreadOverInvoices(
  amount: MoneyLike,
  invoices: Array<{ id: string; balanceAmount: MoneyLike }>,
): { allocations: Array<{ invoiceId: string; allocatedAmount: Prisma.Decimal }>; surplus: Prisma.Decimal } {
  let remaining = money(amount);
  const allocations: Array<{ invoiceId: string; allocatedAmount: Prisma.Decimal }> = [];
  for (const invoice of invoices) {
    if (!remaining.greaterThan(0)) break;
    const take = minMoney(remaining, clampAtZero(invoice.balanceAmount));
    if (!take.greaterThan(0)) continue;
    allocations.push({ invoiceId: invoice.id, allocatedAmount: take });
    remaining = remaining.minus(take);
  }
  return { allocations, surplus: remaining };
}

/**
 * The credit a receipt can still spend: its surplus, less anything a refund is
 * already holding.
 */
export function availableReceiptCredit(receipt: {
  amountUnallocated: MoneyLike;
  refundedAmount: MoneyLike;
}): Prisma.Decimal {
  return clampAtZero(
    money(receipt.amountUnallocated).minus(money(receipt.refundedAmount)),
  );
}

/** The same, for an invoice settled beyond its total. */
export function availableInvoiceCredit(invoice: {
  creditAmount: MoneyLike;
  refundedAmount: MoneyLike;
}): Prisma.Decimal {
  return clampAtZero(
    money(invoice.creditAmount).minus(money(invoice.refundedAmount)),
  );
}
