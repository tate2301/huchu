/**
 * FD-5 — the till receipt becomes a ZIMRA fiscal document.
 *
 * This is the highest-volume fiscal surface there is and the one the US$19 SKU
 * is sold on, so everything here is written for the shop that loses power at
 * 09:00 and reconnects at 14:00 with five hours of sales in the queue. Nothing
 * in this module talks to FDMS: it turns a `RetailSale` and its lines into the
 * {@link FiscalSigningInput} that `lib/accounting/fiscalisation`'s
 * `issueFiscalDocument` signs, chains and submits, and it decides what a till
 * may and may not fiscalise. The transport, the counters and the hash chain
 * stay where they are — the roadmap's standing instruction is that nothing
 * writes a fiscal document outside that service.
 *
 * ## Three things the till knows differently from the ledger
 *
 * **1. Money is `Decimal` here, and a signature has to be exact.** `RetailSale`
 * and `RetailSaleLine` held doubles when this was written; R-1.1 converted 29
 * retail money columns to `Decimal(14,2)` and S-1 finished the rest, so
 * `totalAmount`, `taxAmount` and `lineTotal` arrive here already exact. The
 * signing service refuses a float by design — `Cents` is a branded bigint whose
 * only doors are `centsFromMinorUnits`/`centsFromDecimal` — so the conversion
 * still happens *here*, at the last point that still knows which document the
 * number came from. Doing it deeper (inside the signer) would make "this is
 * $10.30" and "this is a rounding artefact of 10.299999999999999"
 * indistinguishable; doing it shallower (in the sync route) would put the
 * boundary in a request handler where nobody looking for it would think to
 * check.
 *
 * What changed with the columns is which door is used.
 * `centsFromDecimalAmount` multiplies in `Decimal` and refuses a fraction of a
 * cent outright, where the float version has to forgive an epsilon because a
 * double cannot tell 0.30 from 0.30000000000000004. There is nothing to forgive
 * in a `Decimal(14,2)`. `centsFromAccountingAmount` is reused rather than
 * reimplemented so the till and the ledger refuse exactly the same amounts
 * (FD-0.3).
 *
 * **2. A refund is a credit note, and it must cite the original.** ZIMRA has no
 * "negative sale": a `RetailSale` with `saleType` REFUND or VOID is a
 * CREDITNOTE that references the receipt it reverses. The link exists in the
 * schema — `RetailSale.sourceSaleId` points at the sale being refunded or
 * voided — so the original's `FiscalReceipt` is one lookup away, and its
 * `receiptGlobalNo` (plus the fiscal day it was issued in) is what v7.2 wants
 * on the note. A reversal whose original was never fiscalised is **skipped, not
 * failed**: ZIMRA never saw the sale, so there is nothing to credit, and
 * issuing a bare credit note would reduce a day's counters against a receipt
 * that does not exist on their side.
 *
 * **3. The till carries a rate, not a tax code.** `Product.defaultTaxRate`
 * is a percentage; FDGA needs an integer `taxID` per line, which lives on
 * `TaxCode.zimraTaxId` (FD-0.2). So the rate is resolved back to a mapped tax
 * code, and where it cannot be — no code at that rate, or two codes at that
 * rate pointing at different taxIDs, which is the ordinary shape of "exempt"
 * and "zero-rated" both sitting at 0% — the sale is **refused by name**. A
 * guessed taxID is a signature over a VAT treatment the tenant never chose, and
 * it cannot be corrected after the fact. The permanent fix is a tax code on the
 * catalogue item rather than a bare percentage; until that exists, a shop that
 * sells at two different 0% treatments cannot fiscalise from the till, and is
 * told so in as many words.
 *
 * ## Signed in the commit that records the sale, sent after it
 *
 * A sale's fiscal day is settled in the transaction that records the sale
 * ({@link assignRetailSaleFiscalDay}, SET-08), under a lock on the device's
 * day: the day it is signed into, its numbers, its hash on the chain and its
 * PENDING receipt are written in the same commit as the sale — or, while the
 * day's report is on its way to ZIMRA, the mark that it waits. A close claims
 * the day with an update of the same locked row, so a sale is either in the
 * day before the claim (and in its report) or marked after it; there is no
 * moment between the two. Receipts are signed in the order the lock is taken,
 * and each is dated under it, no earlier than the one before, so their dates
 * run in the same order.
 *
 * Only the call to ZIMRA comes after the commit ({@link fiscaliseRetailSale}):
 * it sends the bytes that were signed, and never decides a day again. A
 * refusal about the sale itself (unmapped rate, inconsistent totals, a
 * reversal with no original) is found **before a number is reserved**, so it
 * leaves no gap in the chain; a transport failure leaves the signed receipt
 * holding its place, and replay resends the *same* bytes.
 *
 * ## Every sale that took money gets one receipt, in a day ZIMRA takes
 *
 * ZIMRA takes no receipt dated before its fiscal day opened, or before the
 * last receipt it took. So a receipt carries a date of its own
 * (`FiscalReceipt.receiptDate`), kept with it so a resend sends the same one:
 * the sale's own time — never later than now, so a till whose clock runs fast
 * dates nothing ahead — or the last receipt's date when that is later (an
 * offline sale sent in after another till's receipts, or after its day
 * closed). The sale's `postedAt` is never moved: it stays when the sale was
 * rung, for its slip, its reports and its books. No sale is refused for its
 * date: one dated before the open day began goes into that day, dated with
 * its last receipt. One rung while no day is open because the last one's
 * report is on its way to ZIMRA is PENDING with no receipt and marked as
 * waiting (`RetailSale.fiscalWaitsSince`): it is signed, oldest first and
 * before anything rung after it, into the next day, which opens no later
 * than it and no earlier than the last day's last receipt
 * ({@link signWaitingSales}).
 */
import type { FiscalisationProviderConfig, Prisma, RetailSale, RetailSaleLine } from "@prisma/client";
import { percent, toNumberOrZero, type MoneyLike } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { resolveDeviceSigningKey } from "@/lib/accounting/fdms-connector";
import {
  FiscalMappingError,
  centsFromMoneyLike,
  issueFiscalDocument,
  pendingFields,
  signFiscalReceipt,
  type FiscalIssueErrorCode,
  type FiscalSigningInput,
} from "@/lib/accounting/fiscalisation";
import {
  FiscalSigningError,
  centsFromMinorUnits,
  type Cents,
  type ReceiptTaxLine,
  type ReceiptType,
} from "@/lib/accounting/fdms-receipt-signing";
import { isTaxCodeEffectiveOnDate } from "@/lib/accounting/tax-selection";
import { FISCAL_DAY_STATUS, lockDeviceDay, openFiscalDay, type LockedFiscalDay } from "@/lib/accounting/fiscal-day";
import {
  FISCAL_OFFLINE_WINDOW_MS,
  heldReceiptWords,
  saleNotSignedWords,
  saleWhileClosingWords,
} from "@/lib/retail/fiscal-words";

/** The client, or the transaction a sale is recorded in. */
type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Refusals this module makes itself, on top of the ones the issue path makes.
 *
 * Every one of them means "a human has to change something" — none of them is
 * retryable on its own, and none of them consumed a receipt number.
 */
export type RetailFiscalErrorCode =
  | "RETAIL_SALE_NOT_FOUND"
  | "RETAIL_SALE_TYPE_UNKNOWN"
  | "RETAIL_SALE_NO_LINES"
  | "RETAIL_LINE_TAX_UNKNOWN"
  | "RETAIL_TAX_RATE_UNMAPPED"
  | "RETAIL_TAX_RATE_AMBIGUOUS"
  | "RETAIL_TAX_RATE_DRIFTED"
  | "RETAIL_TOTALS_INCONSISTENT"
  | "RETAIL_SIGN_MISMATCH"
  | "RETAIL_ORIGINAL_NOT_SIGNED"
  | "RETAIL_SALE_NOT_SIGNED"
  | FiscalIssueErrorCode;

/** Raised while mapping a till sale onto the facts ZIMRA signs. */
export class RetailFiscalMappingError extends Error {
  readonly code: RetailFiscalErrorCode;

  constructor(code: RetailFiscalErrorCode, message: string) {
    super(message);
    this.name = "RetailFiscalMappingError";
    this.code = code;
  }
}

export type RetailFiscalStatus = "SKIPPED" | "SUCCESS" | "PENDING" | "FAILED";

export type RetailFiscalOutcome = {
  saleId: string;
  saleNo: string | null;
  /**
   * `SKIPPED` is the ordinary answer for most tenants and is never a problem:
   * the shop has no fiscal device configured, or the sale was voided before it
   * was ever drained, or it reverses a sale ZIMRA never saw.
   */
  fiscalStatus: RetailFiscalStatus;
  fiscalReceiptId: string | null;
  fiscalNumber: string | null;
  /** The verification URL the slip prints. Derived at signing time, so it
   *  exists as soon as the receipt is PENDING — a shop can hand the customer a
   *  scannable slip before FDMS has answered. */
  qrCodeData: string | null;
  receiptGlobalNo: number | null;
  providerReference: string | null;
  fiscalError: string | null;
  errorCode: RetailFiscalErrorCode | null;
  /**
   * True when the refusal is a property of the device or the fiscal day rather
   * than of this sale: every later sale would fail the same way, so a pass over
   * the waiting sales stops there and leaves them waiting.
   */
  blocksDevice: boolean;
};

/**
 * Refusals that are about the device, not about the sale in hand.
 *
 * The test for membership is "would the next sale fail the same way?" — if it
 * would, draining on is pointless at best and signs onto a chain already known
 * broken at worst. `FISCAL_SIGNING_INPUT_REQUIRED` belongs here even though
 * this module cannot currently provoke it (it always supplies signing input):
 * it means the device is live and something reached the issue path unsigned, so
 * every remaining sale in the batch is in the same position, and the day it
 * *does* become reachable is the day a silent per-sale classification would
 * have the drain hammering a live device once per queued sale.
 */
const DEVICE_SCOPED_CODES: ReadonlySet<string> = new Set<FiscalIssueErrorCode>([
  "FISCAL_DAY_NOT_OPEN",
  "FISCAL_DEVICE_KEY_MISSING",
  "FISCAL_CHAIN_OUT_OF_ORDER",
  "FISCAL_SIGNING_INPUT_REQUIRED",
]);

function outcome(
  sale: { id: string; saleNo: string | null },
  patch: Partial<RetailFiscalOutcome> & { fiscalStatus: RetailFiscalStatus },
): RetailFiscalOutcome {
  return {
    saleId: sale.id,
    saleNo: sale.saleNo,
    fiscalReceiptId: null,
    fiscalNumber: null,
    qrCodeData: null,
    receiptGlobalNo: null,
    providerReference: null,
    fiscalError: null,
    errorCode: null,
    blocksDevice: false,
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// Tax: a percentage on the till, an integer taxID at ZIMRA
// ---------------------------------------------------------------------------

export type RetailTaxMapping = {
  /** `TaxCode.zimraTaxId` — the key ZIMRA verifies and aggregates a day by. */
  taxId: number;
  /** The tenant's own code, for error messages a shopkeeper can act on. */
  code: string;
  /** The rate as a fixed-2 string; the bucket key, not something we sum. */
  percent: string;
  /** The same rate as a number, for the canonical string. */
  rate: number;
};

export type RetailTaxResolver = {
  /** The mapping for a till rate, or a named refusal. Never a guess. */
  resolve(ratePercent: number, context: string): RetailTaxMapping;
};

/** Fixed-2 so 15, 15.0 and 15.00 are one bucket rather than three. */
function percentKey(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new RetailFiscalMappingError(
      "RETAIL_TAX_RATE_UNMAPPED",
      `Tax rate ${String(rate)} is not a usable percentage`,
    );
  }
  return rate.toFixed(2);
}

/**
 * The tenant's rate → taxID table, as of a date.
 *
 * Only codes that carry a `zimraTaxId` are considered: an unmapped code is not
 * a candidate for anything, and including it would turn "you have not mapped
 * 15% yet" into "15% is ambiguous". Withholding codes are excluded because they
 * are not a supply's VAT treatment, and the effective window is honoured
 * against the sale's own date so a rate change does not retroactively relabel
 * receipts that were rung before it.
 */
export async function loadRetailTaxResolver(
  input: {
    companyId: string;
    asOf: Date;
  },
  db: Db = prisma,
): Promise<RetailTaxResolver> {
  const codes = await db.taxCode.findMany({
    where: {
      companyId: input.companyId,
      isActive: true,
      zimraTaxId: { not: null },
      type: { not: "WITHHOLDING" },
      appliesTo: { in: ["SALES", "BOTH"] },
    },
    select: {
      id: true,
      code: true,
      rate: true,
      zimraTaxId: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
    // Deterministic, so two codes that agree on a taxID always name the same
    // one in a message.
    orderBy: [{ code: "asc" }],
  });

  const byPercent = new Map<string, RetailTaxMapping[]>();
  for (const code of codes) {
    if (!isTaxCodeEffectiveOnDate(code, input.asOf)) continue;
    const key = percentKey(code.rate);
    const mapping: RetailTaxMapping = {
      taxId: code.zimraTaxId!,
      code: code.code,
      percent: key,
      rate: code.rate,
    };
    const bucket = byPercent.get(key);
    if (bucket) bucket.push(mapping);
    else byPercent.set(key, [mapping]);
  }

  return {
    resolve(ratePercent, context) {
      const key = percentKey(ratePercent);
      const candidates = byPercent.get(key) ?? [];
      if (candidates.length === 0) {
        throw new RetailFiscalMappingError(
          "RETAIL_TAX_RATE_UNMAPPED",
          `No active tax code with a ZIMRA taxID charges ${key}% (${context}): map one in tax setup before this sale can be fiscalised`,
        );
      }
      const distinct = [...new Set(candidates.map((candidate) => candidate.taxId))];
      if (distinct.length > 1) {
        // The classic case is exempt and zero-rated, both at 0%. The till
        // records a percentage and nothing else, so there is no honest way to
        // pick — and picking wrong signs the wrong VAT treatment.
        throw new RetailFiscalMappingError(
          "RETAIL_TAX_RATE_AMBIGUOUS",
          `Tax codes ${candidates.map((c) => c.code).join(", ")} all charge ${key}% but map to different ZIMRA taxIDs (${distinct.join(", ")}); the till records only a rate (${context}), so the taxID cannot be resolved`,
        );
      }
      return candidates[0];
    },
  };
}

// ---------------------------------------------------------------------------
// The signable facts of a till sale
// ---------------------------------------------------------------------------

/** What a till sale contributes to a fiscal day's counters, per taxID. Kept
 *  beside the signing input because the Z-report needs the sales value and the
 *  canonical string does not (FD-2's `taxLinesByReceiptId`). */
export type RetailFiscalTaxLine = {
  taxId: number;
  taxPercent: string | null;
  /** Tax value, minor units. */
  taxAmountCents: bigint;
  /** Sales value INCLUDING tax, minor units. */
  salesAmountCents: bigint;
};

export type RetailSaleLineForSigning = {
  itemName: string;
  /**
   * `Decimal`, because `RetailSaleLine` is. Accepting `MoneyLike` rather than
   * the column type keeps a hand-built line in a test from having to construct
   * Decimals it does not care about, while `money()` at the boundary means the
   * signer never sees anything but an exact figure.
   */
  taxAmount: MoneyLike;
  lineTotal: MoneyLike;
  /** `Product.defaultTaxRate` as it stood when the line was resolved. */
  taxPercent: MoneyLike;
};

export type RetailSaleForSigning = {
  saleNo: string;
  /** `RetailSaleType` in practice; `retailReceiptType` refuses anything else. */
  saleType: string;
  currency: string;
  /** `Decimal` off a row, a number from a fixture. Exact either way by the time
   *  it reaches `centsFromDecimalAmount`. */
  totalAmount: MoneyLike;
  taxAmount: MoneyLike;
  receiptDate: Date;
};

export type RetailSigningBundle = {
  fiscal: FiscalSigningInput;
  taxLines: RetailFiscalTaxLine[];
};

/**
 * FISCALINVOICE for a sale, CREDITNOTE for anything that reverses one.
 *
 * A VOID is a credit note for the same reason a REFUND is: once a receipt has
 * been given to ZIMRA it cannot be withdrawn, only reduced. (A void that never
 * reached ZIMRA is not fiscalised at all — see {@link fiscaliseRetailSale}.)
 */
export function retailReceiptType(saleType: string): ReceiptType {
  switch (saleType) {
    case "SALE":
      return "FISCALINVOICE";
    case "REFUND":
    case "VOID":
      return "CREDITNOTE";
    default:
      throw new RetailFiscalMappingError(
        "RETAIL_SALE_TYPE_UNKNOWN",
        `Sale type ${saleType} has no ZIMRA receipt type`,
      );
  }
}

/** One cent of slack, and only on the *label*.
 *
 *  The amount signed for a line is always the line's own stored `taxAmount`;
 *  this check only asks whether the catalogue rate still explains it, so that a
 *  catalogue edited during a load-shedding gap cannot relabel a queued sale's
 *  VAT. A refund apportions tax by a ratio and rounds the result, which can
 *  legitimately land a cent away from `taxable × rate`; a rate that actually
 *  changed moves the figure by far more than that on any line worth ringing. */
const RATE_EXPLANATION_TOLERANCE_CENTS = BigInt(1);

/** `0n` literals are not available at this tsconfig target; the signing module
 *  does the same thing for the same reason. */
const ZERO_CENTS = BigInt(0);

function absBigInt(value: bigint): bigint {
  return value < ZERO_CENTS ? -value : value;
}

/**
 * The facts ZIMRA signs for one till sale.
 *
 * Pure: it is handed the sale, its lines with their resolved rates, and the
 * rate→taxID table, and it either returns exact minor units or throws. Every
 * float in the source document crosses to `Cents` in this function and nowhere
 * else in the retail path.
 *
 * The two totals checks are the FD-0.3 property stated for the till: the signed
 * total is the sale's own `totalAmount` — what the customer was charged and
 * what the slip says — and the tax lines must add up to it exactly. If they do
 * not, the receipt and its tax breakdown disagree, the day's counters cannot
 * reconcile against it, and no amount of rounding makes that safe to sign.
 */
export function buildRetailSaleSigningInput(input: {
  sale: RetailSaleForSigning;
  lines: RetailSaleLineForSigning[];
  resolver: RetailTaxResolver;
}): RetailSigningBundle {
  const { sale, lines, resolver } = input;

  if (lines.length === 0) {
    throw new RetailFiscalMappingError(
      "RETAIL_SALE_NO_LINES",
      `Sale ${sale.saleNo} has no lines and cannot be fiscalised`,
    );
  }

  const receiptType = retailReceiptType(sale.saleType);
  const receiptTotal = centsFromMoneyLike(
    sale.totalAmount,
    `total of sale ${sale.saleNo}`,
  );

  // A credit note is signed negative and a sale positive. The retail services
  // already store a reversal's amounts negative, so a disagreement here means
  // the row was written by something that did not, and signing it would tell
  // ZIMRA a refund was a sale.
  if (receiptType === "CREDITNOTE" && receiptTotal > ZERO_CENTS) {
    throw new RetailFiscalMappingError(
      "RETAIL_SIGN_MISMATCH",
      `Sale ${sale.saleNo} reverses another sale but its total (${sale.totalAmount}) is positive`,
    );
  }
  if (receiptType === "FISCALINVOICE" && receiptTotal < ZERO_CENTS) {
    throw new RetailFiscalMappingError(
      "RETAIL_SIGN_MISMATCH",
      `Sale ${sale.saleNo} is a sale but its total (${sale.totalAmount}) is negative`,
    );
  }

  const buckets = new Map<number, RetailFiscalTaxLine & { rate: number }>();
  let linesTotalCents = ZERO_CENTS;

  for (const line of lines) {
    // `Product.defaultTaxRate` is `Decimal(5,2)`; the resolver buckets on a
    // number at fixed-2. `percent()` normalises first, so 15, 15.0 and 15.00
    // reach `percentKey` as one rate rather than three.
    const mapping = resolver.resolve(
      toNumberOrZero(percent(line.taxPercent)),
      `${line.itemName} on ${sale.saleNo}`,
    );
    const taxCents = centsFromMoneyLike(
      line.taxAmount,
      `tax on ${line.itemName} (${sale.saleNo})`,
    );
    const lineCents = centsFromMoneyLike(
      line.lineTotal,
      `line total for ${line.itemName} (${sale.saleNo})`,
    );
    linesTotalCents += lineCents;

    // Does the rate we are about to sign still explain the tax that was rung?
    const taxableCents = lineCents - taxCents;
    const expectedTaxCents = BigInt(
      Math.round((Number(taxableCents) * mapping.rate) / 100),
    );
    if (absBigInt(expectedTaxCents - taxCents) > RATE_EXPLANATION_TOLERANCE_CENTS) {
      throw new RetailFiscalMappingError(
        "RETAIL_TAX_RATE_DRIFTED",
        `${line.itemName} on ${sale.saleNo} was rung with ${line.taxAmount} tax, which ${mapping.percent}% (tax code ${mapping.code}) does not explain; the catalogue rate changed after the sale and the receipt cannot be signed against either figure`,
      );
    }

    const bucket = buckets.get(mapping.taxId);
    if (bucket) {
      bucket.taxAmountCents += taxCents;
      bucket.salesAmountCents += lineCents;
      continue;
    }
    buckets.set(mapping.taxId, {
      taxId: mapping.taxId,
      // An exempt or zero-rated line carries no percent in the canonical
      // string, exactly as the invoice path does it.
      taxPercent: mapping.rate > 0 ? mapping.percent : null,
      taxAmountCents: taxCents,
      salesAmountCents: lineCents,
      rate: mapping.rate,
    });
  }

  if (linesTotalCents !== receiptTotal) {
    throw new RetailFiscalMappingError(
      "RETAIL_TOTALS_INCONSISTENT",
      `Sale ${sale.saleNo} totals ${sale.totalAmount} but its lines add up to ${(Number(linesTotalCents) / 100).toFixed(2)}; the receipt and its tax breakdown must agree before either can be signed`,
    );
  }

  const declaredTaxCents = centsFromMoneyLike(
    sale.taxAmount,
    `tax total of sale ${sale.saleNo}`,
  );
  const lineTaxCents = [...buckets.values()].reduce(
    (total, bucket) => total + bucket.taxAmountCents,
    ZERO_CENTS,
  );
  if (lineTaxCents !== declaredTaxCents) {
    throw new RetailFiscalMappingError(
      "RETAIL_TOTALS_INCONSISTENT",
      `Sale ${sale.saleNo} declares ${sale.taxAmount} tax but its lines carry ${(Number(lineTaxCents) / 100).toFixed(2)}`,
    );
  }

  const ordered = [...buckets.values()].sort((a, b) => a.taxId - b.taxId);
  const taxes: ReceiptTaxLine[] = ordered.map((bucket) => ({
    taxId: bucket.taxId,
    taxPercent: bucket.rate > 0 ? bucket.rate : null,
    taxAmount: centsFromMinorUnits(bucket.taxAmountCents) as Cents,
  }));

  return {
    fiscal: {
      receiptType,
      receiptCurrency: sale.currency,
      // The receipt's own date (`FiscalReceipt.receiptDate`): the sale's time,
      // never later than now, or the day's last receipt when that is later, so
      // ZIMRA's dates never go backwards and a resend sends the same one.
      receiptDate: sale.receiptDate,
      receiptTotal,
      taxes,
    },
    taxLines: ordered.map(({ rate: _rate, ...line }) => line),
  };
}

// ---------------------------------------------------------------------------
// Loading a sale and issuing it
// ---------------------------------------------------------------------------

const SALE_INCLUDE = {
  lines: {
    select: {
      id: true,
      itemName: true,
      // S-4 dropped `catalogItemId`, and this asked for it — so every fiscalisation
      // threw a Prisma validation error before it reached the signer. It was
      // doubly wrong: `resolveLineRates` reads `line.productId`, which this
      // never selected, so the rate lookup would have seen `undefined` even had
      // the column survived. The `as LoadedSale` cast below hid both halves
      // from the compiler; `LoadedSale` has said `productId` all along.
      productId: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      taxAmount: true,
      lineTotal: true,
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  payments: {
    select: { tenderType: true, amount: true, reference: true },
  },
};

type LoadedSale = RetailSale & {
  lines: Array<
    Pick<
      RetailSaleLine,
      | "id"
      | "itemName"
      | "productId"
      | "quantity"
      | "unitPrice"
      | "discountAmount"
      | "taxAmount"
      | "lineTotal"
    >
  >;
  payments: Array<{ tenderType: string; amount: number; reference: string | null }>;
};

/**
 * The rate for each line, taken from the product it was sold from.
 *
 * `RetailSaleLine` stores the tax *amount* but not the rate, so the rate has to
 * come back from `Product.defaultTaxRate`. A line whose product is gone — or
 * that never had one — is refused rather than defaulted to zero: "zero-rated"
 * is a VAT treatment, not a fallback, and a sale signed at 0% because a lookup
 * missed is an understated return.
 *
 * This read `RetailCatalogItem.taxPercent` until S-4 retired that table.
 * `Product` is the one item master now, and `RetailSaleLine.productId` is the
 * link — back-filled across 12,358 rows, and `SetNull` rather than `Restrict`
 * so archiving a line off the range cannot make six months of receipts
 * undeletable. A null `productId` is therefore reachable, and it lands in the
 * refusal below rather than in a zero.
 */
async function resolveLineRates(
  companyId: string,
  sale: LoadedSale,
  db: Db = prisma,
): Promise<RetailSaleLineForSigning[]> {
  const productIds = [
    ...new Set(sale.lines.map((line) => line.productId).filter((id): id is string => Boolean(id))),
  ];
  const products = productIds.length
    ? await db.product.findMany({
        // No active filter: an archived line's historical sale still has to
        // fiscalise, and the rate it was sold at is still on the row.
        where: { companyId, id: { in: productIds } },
        select: { id: true, defaultTaxRate: true },
      })
    : [];
  const rateByProduct = new Map(products.map((item) => [item.id, item.defaultTaxRate]));

  return sale.lines.map((line) => {
    const taxPercent = line.productId ? rateByProduct.get(line.productId) : undefined;
    if (taxPercent === undefined) {
      throw new RetailFiscalMappingError(
        "RETAIL_LINE_TAX_UNKNOWN",
        `${line.itemName} on ${sale.saleNo} has no product to take a tax rate from, so its ZIMRA taxID cannot be resolved`,
      );
    }
    return {
      itemName: line.itemName,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
      taxPercent,
    };
  });
}

/** The original receipt a credit note reduces. */
export type CreditedReceiptReference = {
  saleId: string;
  saleNo: string;
  fiscalReceiptId: string;
  receiptGlobalNo: number;
  receiptCounter: number | null;
  fiscalDayNo: number | null;
  deviceId: string | null;
  fiscalNumber: string | null;
  receiptHash: string | null;
};

/**
 * Find the receipt a reversal credits, or say why there is not one.
 *
 * `null` means "ZIMRA never saw the original", which is a skip and not a
 * failure. A throw means the original *was* fiscalised but on the pre-native
 * path, so it has no global number to cite — that is a real refusal, because a
 * credit note without a reference is a credit note ZIMRA rejects.
 */
async function loadCreditedReceipt(
  companyId: string,
  sale: LoadedSale,
  db: Db,
): Promise<CreditedReceiptReference | null> {
  if (!sale.sourceSaleId) return null;

  const original = await db.retailSale.findFirst({
    where: { id: sale.sourceSaleId, companyId },
    select: {
      id: true,
      saleNo: true,
      currency: true,
      fiscalReceipt: {
        select: {
          id: true,
          status: true,
          receiptGlobalNo: true,
          receiptCounter: true,
          receiptHash: true,
          fiscalNumber: true,
          fiscalDay: { select: { fiscalDayNo: true, deviceId: true } },
        },
      },
    },
  });
  const receipt = original?.fiscalReceipt;
  if (!original || !receipt || receipt.status === "VOIDED") return null;

  if (receipt.receiptGlobalNo === null) {
    throw new RetailFiscalMappingError(
      "RETAIL_ORIGINAL_NOT_SIGNED",
      `Sale ${sale.saleNo} credits ${original.saleNo}, whose fiscal receipt was issued without a global number; there is nothing for the credit note to reference`,
    );
  }

  // The credit note is signed in its own currency and reduces a receipt issued
  // in the original's. If the two disagree the reduction is meaningless — and
  // today it disagrees silently, because the retail services do not copy the
  // source sale's currency onto the reversal.
  if (original.currency !== sale.currency) {
    throw new RetailFiscalMappingError(
      "RETAIL_SIGN_MISMATCH",
      `Sale ${sale.saleNo} is in ${sale.currency} but credits ${original.saleNo}, which was fiscalised in ${original.currency}`,
    );
  }

  return {
    saleId: original.id,
    saleNo: original.saleNo,
    fiscalReceiptId: receipt.id,
    receiptGlobalNo: receipt.receiptGlobalNo,
    receiptCounter: receipt.receiptCounter,
    fiscalDayNo: receipt.fiscalDay?.fiscalDayNo ?? null,
    deviceId: receipt.fiscalDay?.deviceId ?? null,
    fiscalNumber: receipt.fiscalNumber,
    receiptHash: receipt.receiptHash,
  };
}

/**
 * Everything FDMS is told about one till sale.
 *
 * Shaped like the sales-invoice and school-receipt payloads on purpose — the
 * connector posts whatever object it is handed, and a provider integration
 * written against one shape should not have to learn a third.
 *
 * `creditDebitNote` is where the reference to the original receipt lives. The
 * signed wire block is built by `buildNativeReceiptWire` in
 * `lib/accounting/fiscalisation`, which does not carry a reference field yet
 * (FD-4.1 owns that); when it grows one, this is the object it should read.
 */
export function buildRetailSalePayload(input: {
  sale: LoadedSale;
  lines: RetailSaleLineForSigning[];
  taxLines: RetailFiscalTaxLine[];
  credited: CreditedReceiptReference | null;
  supplier: Record<string, unknown> | null;
}) {
  const { sale, credited } = input;

  return {
    documentType: sale.saleType === "SALE" ? "RETAIL_SALE" : "RETAIL_CREDIT_NOTE",
    invoiceNumber: sale.saleNo,
    invoiceDate: sale.postedAt ?? sale.createdAt,
    currency: sale.currency,
    totals: {
      subTotal: sale.subtotal,
      discount: sale.discountAmount,
      taxTotal: sale.taxAmount,
      total: sale.totalAmount,
    },
    // Minor units as strings: these are the exact figures that were signed, and
    // a JSON number would put them back through a double on the way out.
    taxBreakdown: input.taxLines.map((line) => ({
      taxID: line.taxId,
      taxPercent: line.taxPercent,
      taxAmountCents: line.taxAmountCents.toString(),
      salesAmountCents: line.salesAmountCents.toString(),
    })),
    supplier: input.supplier,
    customer: { name: sale.customerName },
    site: { siteId: sale.siteId, shiftId: sale.shiftId, cashier: sale.cashierName },
    payments: sale.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: payment.amount,
      reference: payment.reference,
    })),
    items: sale.lines.map((line, index) => ({
      description: line.itemName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      taxRate: input.lines[index]?.taxPercent ?? null,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
    })),
    ...(credited
      ? {
          creditDebitNote: {
            receiptID: credited.fiscalReceiptId,
            deviceID: credited.deviceId,
            receiptGlobalNo: credited.receiptGlobalNo,
            fiscalDayNo: credited.fiscalDayNo,
            originalReceiptNo: credited.fiscalNumber,
            originalSaleNo: credited.saleNo,
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// The sale's fiscal day, settled in the commit that records the sale (SET-08)
// ---------------------------------------------------------------------------

export const FISCAL_PROVIDER_KEY = "ZIMRA_FDMS";

/**
 * The shop's fiscal device: the company's `ZIMRA_FDMS` provider config. The
 * one device the tills sign with, the close closes and Setup › Fiscal device
 * shows (SET-08); a device the books' console adds under another key is not
 * the shop's.
 */
export function shopFiscalDevice(companyId: string, db: Db = prisma): Promise<FiscalisationProviderConfig | null> {
  return db.fiscalisationProviderConfig.findUnique({
    where: { companyId_providerKey: { companyId, providerKey: FISCAL_PROVIDER_KEY } },
  });
}

/** The shop's fiscal device while it is in use. None means the shop does not fiscalise. */
async function tillDevice(companyId: string, db: Db): Promise<FiscalisationProviderConfig | null> {
  const device = await shopFiscalDevice(companyId, db);
  return device?.isActive ? device : null;
}

function loadSale(companyId: string, saleId: string, db: Db): Promise<LoadedSale | null> {
  return db.retailSale.findFirst({
    where: { id: saleId, companyId },
    include: SALE_INCLUDE,
  }) as Promise<LoadedSale | null>;
}

/**
 * The earliest date the day's next receipt may carry: its last receipt's
 * date, or its own opening when it took none. Receipts are dated in the order
 * they are signed, so the last signed is the latest. ZIMRA takes no receipt
 * dated before the last one it took.
 */
async function lastReceiptAt(db: Db, day: { id: string; openedAt: Date }): Promise<Date> {
  const last = await db.fiscalReceipt.findFirst({
    where: { fiscalDayId: day.id, receiptDate: { not: null } },
    orderBy: { receiptCounter: "desc" },
    select: { receiptDate: true },
  });
  const at = last?.receiptDate;
  return at && at.getTime() > day.openedAt.getTime() ? at : day.openedAt;
}

/** The device's newest day, closed or not. */
function latestDay(db: Db, providerConfigId: string) {
  return db.fiscalDay.findFirst({
    where: { providerConfigId },
    orderBy: { fiscalDayNo: "desc" },
    select: { id: true, fiscalDayNo: true, status: true, openedAt: true },
  });
}

/** The sales marked as waiting for a day to be signed into, oldest first (SET-08). */
export async function waitingSales(companyId: string, options: { take?: number } = {}, db: Db = prisma) {
  return db.retailSale.findMany({
    where: { companyId, fiscalWaitsSince: { not: null }, fiscalReceipt: { is: null } },
    orderBy: [{ postedAt: "asc" }, { id: "asc" }],
    select: { id: true, postedAt: true },
    ...(options.take ? { take: options.take } : {}),
  });
}

/** Waits for a day to be signed into: not signed yet, and not failed. */
function waitsForDay(sale: { id: string; saleNo: string | null }, dayNo: number): RetailFiscalOutcome {
  return outcome(sale, {
    fiscalStatus: "PENDING",
    errorCode: "FISCAL_DAY_NOT_OPEN",
    fiscalError: saleWhileClosingWords(dayNo),
  });
}

function isWaiting(result: RetailFiscalOutcome): boolean {
  return result.fiscalStatus === "PENDING" && result.fiscalReceiptId === null;
}

function noDevice(sale: { id: string; saleNo: string | null }): RetailFiscalOutcome {
  return outcome(sale, {
    fiscalStatus: "SKIPPED",
    fiscalError: "No active fiscalisation device is configured for this company",
  });
}

/** A refusal about the sale's facts, named so a till can say which sale and why. */
function mappingRefusal(sale: { id: string; saleNo: string }, error: unknown): RetailFiscalOutcome | null {
  if (error instanceof RetailFiscalMappingError || error instanceof FiscalMappingError) {
    return outcome(sale, { fiscalStatus: "FAILED", errorCode: error.code, fiscalError: error.message });
  }
  // The float boundary refusing an amount finer than a cent.
  if (error instanceof FiscalSigningError) {
    return outcome(sale, { fiscalStatus: "FAILED", errorCode: "FISCAL_SIGNING_REFUSED", fiscalError: error.message });
  }
  return null;
}

/**
 * The tax a till receipt was signed with (`FiscalReceipt.signedTax`): each sale
 * line's rate, by line id, and the receipt's lines per ZIMRA taxID in minor
 * units. Written in the transaction that signs the receipt. A resend sends it
 * and the day's Z-report counts it, so a catalogue rate edited after the sale
 * changes neither (SET-08).
 */
export type SignedRetailTax = {
  lineRates: Record<string, string>;
  taxLines: Array<{ taxId: number; taxPercent: string | null; taxAmountCents: string; salesAmountCents: string }>;
};

function signedTaxOf(sale: LoadedSale, lines: RetailSaleLineForSigning[], taxLines: RetailFiscalTaxLine[]): SignedRetailTax {
  return {
    lineRates: Object.fromEntries(sale.lines.map((line, index) => [line.id, percent(lines[index]!.taxPercent).toFixed(2)])),
    taxLines: taxLines.map((line) => ({
      taxId: line.taxId,
      taxPercent: line.taxPercent,
      taxAmountCents: line.taxAmountCents.toString(),
      salesAmountCents: line.salesAmountCents.toString(),
    })),
  };
}

function signedTaxLines(signed: SignedRetailTax): RetailFiscalTaxLine[] {
  return signed.taxLines.map((line) => ({
    taxId: line.taxId,
    taxPercent: line.taxPercent,
    taxAmountCents: BigInt(line.taxAmountCents),
    salesAmountCents: BigInt(line.salesAmountCents),
  }));
}

/**
 * The facts ZIMRA signs for a sale, dated `receiptDate`, and the document it
 * is told about. Signing, its tax is the tax as of the sale's own time, from
 * each line's product; sent again (`signed`), it is the tax it was signed with,
 * never re-read. Throws a mapping refusal; null for a reversal of a sale ZIMRA
 * never saw.
 */
async function signable(companyId: string, sale: LoadedSale, db: Db, receiptDate: Date, signed: SignedRetailTax | null = null) {
  let credited: CreditedReceiptReference | null = null;
  if (sale.saleType !== "SALE") {
    credited = await loadCreditedReceipt(companyId, sale, db);
    if (!credited) return null;
  }
  let lines: RetailSaleLineForSigning[];
  let fiscal: FiscalSigningInput;
  let taxLines: RetailFiscalTaxLine[];
  if (signed) {
    lines = sale.lines.map((line) => {
      const taxPercent = signed.lineRates[line.id];
      if (taxPercent === undefined) {
        throw new RetailFiscalMappingError(
          "RETAIL_TOTALS_INCONSISTENT",
          `${line.itemName} on ${sale.saleNo} was not on the sale when its receipt was signed`,
        );
      }
      return { itemName: line.itemName, taxAmount: line.taxAmount, lineTotal: line.lineTotal, taxPercent };
    });
    taxLines = signedTaxLines(signed);
    fiscal = {
      receiptType: retailReceiptType(sale.saleType),
      receiptCurrency: sale.currency,
      receiptDate,
      receiptTotal: centsFromMoneyLike(sale.totalAmount, `total of sale ${sale.saleNo}`),
      taxes: taxLines.map((line) => ({
        taxId: line.taxId,
        taxPercent: line.taxPercent === null ? null : Number(line.taxPercent),
        taxAmount: centsFromMinorUnits(line.taxAmountCents) as Cents,
      })),
    };
  } else {
    lines = await resolveLineRates(companyId, sale, db);
    const resolver = await loadRetailTaxResolver({ companyId, asOf: sale.postedAt ?? sale.createdAt }, db);
    ({ fiscal, taxLines } = buildRetailSaleSigningInput({ sale: { ...sale, receiptDate }, lines, resolver }));
  }
  const supplier = await db.accountingSettings.findUnique({
    where: { companyId },
    select: { legalName: true, tradingName: true, vatNumber: true, taxNumber: true, address: true, phone: true, email: true },
  });
  return {
    fiscal,
    payload: buildRetailSalePayload({ sale, lines, taxLines, credited, supplier }),
    signedTax: signed ?? signedTaxOf(sale, lines, taxLines),
  };
}

function skippedReversal(sale: { id: string; saleNo: string }): RetailFiscalOutcome {
  // Nothing at ZIMRA to reduce. Not a failure: the original never got there,
  // so the reversal has nothing to say.
  return outcome(sale, {
    fiscalStatus: "SKIPPED",
    fiscalError: `Sale ${sale.saleNo} reverses a sale that was never fiscalised, so no credit note is due`,
  });
}

/** Namespaced: a till sale id and an invoice id are both uuids and the provider sees only this string. */
function idempotencyKeyOf(companyId: string, saleId: string): string {
  return `${companyId}:retail-sale:${saleId}`;
}

/**
 * Sign a sale into `day`, dated `receiptDate`, in the transaction that holds
 * the day: its numbers taken, its hash chained, its PENDING receipt written.
 * Nothing is sent: the receipt goes to ZIMRA after the commit
 * ({@link fiscaliseRetailSale}). Refusals come back before a number is taken.
 */
async function signInto(
  tx: Prisma.TransactionClient,
  device: FiscalisationProviderConfig,
  day: { id: string; fiscalDayNo: number },
  sale: LoadedSale,
  receiptDate: Date,
): Promise<RetailFiscalOutcome> {
  const signingKey = resolveDeviceSigningKey(device);
  if (!signingKey) {
    return outcome(sale, {
      fiscalStatus: "FAILED",
      errorCode: "FISCAL_DEVICE_KEY_MISSING",
      fiscalError: `Fiscalisation provider ${device.providerKey} has no device private key; register the device before issuing fiscal documents`,
      blocksDevice: true,
    });
  }
  try {
    const facts = await signable(sale.companyId, sale, tx, receiptDate);
    if (!facts) return skippedReversal(sale);
    const receipt = await signFiscalReceipt(tx, {
      provider: device,
      day,
      source: { kind: "RETAIL_SALE", retailSaleId: sale.id },
      documentNumber: sale.saleNo,
      companyId: sale.companyId,
      existing: null,
      pending: pendingFields(device, idempotencyKeyOf(sale.companyId, sale.id), facts.payload),
      sendingNow: false,
      fiscal: facts.fiscal,
      signingKey,
    });
    // Kept with the signature: what a resend sends and the day's report counts.
    await tx.fiscalReceipt.update({ where: { id: receipt.id }, data: { signedTax: facts.signedTax } });
    return outcome(sale, {
      fiscalStatus: "PENDING",
      fiscalReceiptId: receipt.id,
      qrCodeData: receipt.qrCodeData,
      receiptGlobalNo: receipt.receiptGlobalNo,
    });
  } catch (error) {
    const refused = mappingRefusal(sale, error);
    if (refused) return refused;
    throw error;
  }
}

/**
 * Where a sale goes, decided under the lock on the device's day
 * ({@link lockDeviceDay}) so nothing can change it before the commit:
 *
 * - The day is closing (its report is on its way to ZIMRA): the sale waits,
 *   marked, for the next day that is open.
 * - Sales are waiting (`waitingFirst`): it waits behind them, so they go in
 *   oldest first and before it.
 * - No day is open: it opens one, no later than the sale, if the device is
 *   registered — never before the last day's last receipt.
 * - A day is open: it is signed into it, dated its own time or the day's last
 *   receipt's, whichever is later. Never refused for its date.
 */
async function placeSale(
  tx: Prisma.TransactionClient,
  device: FiscalisationProviderConfig,
  locked: LockedFiscalDay | null,
  sale: LoadedSale,
  options: { waitingFirst: boolean },
): Promise<RetailFiscalOutcome> {
  // A sale voided before it was ever signed was never given to ZIMRA and never
  // should be: the reversal that voided it is skipped for the same reason.
  if (sale.status !== "POSTED") {
    return outcome(sale, { fiscalStatus: "SKIPPED", fiscalError: `Sale ${sale.saleNo} is ${sale.status} and is not fiscalised` });
  }
  // The sale's own time, never later than now: a till whose clock runs fast dates no receipt ahead of the rest.
  const at = Math.min((sale.postedAt ?? sale.createdAt).getTime(), Date.now());
  const wait = async (dayNo: number) => {
    if (!sale.fiscalWaitsSince) await tx.retailSale.update({ where: { id: sale.id }, data: { fiscalWaitsSince: new Date() } });
    return waitsForDay(sale, dayNo);
  };

  if (locked?.status === FISCAL_DAY_STATUS.CLOSING) return wait(locked.fiscalDayNo);
  const ahead =
    options.waitingFirst &&
    (await tx.retailSale.findFirst({
      where: { companyId: sale.companyId, fiscalWaitsSince: { not: null }, fiscalReceipt: { is: null }, id: { not: sale.id } },
      select: { id: true },
    }));
  if (ahead) {
    const last = locked ?? (await latestDay(tx, device.id));
    if (last) return wait(last.fiscalDayNo);
  }

  let day = locked;
  if (!day) {
    if (!device.registeredAt || !device.deviceId) {
      return outcome(sale, {
        fiscalStatus: "FAILED",
        errorCode: "FISCAL_DAY_NOT_OPEN",
        fiscalError: "No fiscal day is open for this device",
        blocksDevice: true,
      });
    }
    const last = await latestDay(tx, device.id);
    const floor = last ? (await lastReceiptAt(tx, last)).getTime() : 0;
    day = await openFiscalDay({ companyId: sale.companyId, providerConfigId: device.id, openedAt: new Date(Math.max(at, floor)) }, tx);
  }
  const receiptDate = new Date(Math.max(at, (await lastReceiptAt(tx, day)).getTime()));
  return signInto(tx, device, day, sale, receiptDate);
}

/**
 * Settle a till sale's fiscal day in the transaction that records it, as its
 * last step (SET-08): pos/sales (rung now or sent in from the offline queue), a refund and a void each call it
 * before they commit. It holds the device's day for the rest of the
 * transaction, so the day a sale is in is decided once, here, and nothing
 * can come between the decision and the commit: a close claims the day either
 * before (the sale waits, marked) or after (the sale is in the day, and in
 * its report).
 *
 * The receipt is dated here, under the lock, so receipts are dated in the
 * order they are signed; the sale keeps its own `postedAt`. The receipt is
 * signed and written here; it is sent after the commit, by
 * {@link fiscaliseRetailSale}, which never decides a day again.
 */
export async function assignRetailSaleFiscalDay(
  tx: Prisma.TransactionClient,
  input: { companyId: string; saleId: string },
): Promise<RetailFiscalOutcome> {
  const device = await tillDevice(input.companyId, tx);
  const locked = device ? await lockDeviceDay(tx, device.id) : null;
  const sale = await loadSale(input.companyId, input.saleId, tx);
  if (!sale) throw new Error(`Sale ${input.saleId} is not this company's`);
  return device ? placeSale(tx, device, locked, sale, { waitingFirst: true }) : noDevice(sale);
}

/** What the receipt row says, for a sale another caller signed and sends. */
function receiptOutcome(
  sale: { id: string; saleNo: string },
  receipt: { id: string; status: string; fiscalNumber: string | null; qrCodeData: string | null; receiptGlobalNo: number | null; providerReference: string | null; lastError: string | null },
): RetailFiscalOutcome {
  return outcome(sale, {
    fiscalStatus: receipt.status === "VOIDED" ? "FAILED" : (receipt.status as RetailFiscalStatus),
    fiscalReceiptId: receipt.id,
    fiscalNumber: receipt.fiscalNumber,
    qrCodeData: receipt.qrCodeData,
    receiptGlobalNo: receipt.receiptGlobalNo,
    providerReference: receipt.providerReference,
    fiscalError: receipt.status === "SUCCESS" ? null : receipt.lastError,
  });
}

/** Send a signed sale's receipt to ZIMRA, on the shop's device: the same signed bytes, date and tax, every time. */
async function sendSigned(
  sale: LoadedSale,
  receipt: { id: string; receiptDate: Date | null; signedTax: Prisma.JsonValue | null },
  holdWhileUnreachable: boolean,
): Promise<RetailFiscalOutcome> {
  const device = await tillDevice(sale.companyId, prisma);
  if (!device) return noDevice(sale);
  if (!receipt.receiptDate) throw new Error(`Fiscal receipt ${receipt.id} of ${sale.saleNo} is signed but has no receipt date`);
  if (!receipt.signedTax) throw new Error(`Fiscal receipt ${receipt.id} of ${sale.saleNo} is signed but has no signed tax`);
  let facts: Awaited<ReturnType<typeof signable>>;
  try {
    facts = await signable(sale.companyId, sale, prisma, receipt.receiptDate, receipt.signedTax as SignedRetailTax);
  } catch (error) {
    const refused = mappingRefusal(sale, error);
    if (refused) return refused;
    throw error;
  }
  if (!facts) return skippedReversal(sale);
  const result = await issueFiscalDocument({
    companyId: sale.companyId,
    source: { kind: "RETAIL_SALE", retailSaleId: sale.id },
    documentNumber: sale.saleNo,
    idempotencyKey: idempotencyKeyOf(sale.companyId, sale.id),
    payload: facts.payload,
    fiscal: facts.fiscal,
    holdWhileUnreachableMs: holdWhileUnreachable ? FISCAL_OFFLINE_WINDOW_MS : undefined,
    provider: device,
  });
  // The QR and the global number exist from the moment the receipt is signed —
  // before FDMS has answered — which is what lets a till print a scannable slip
  // while it is still PENDING.
  const row = result.receiptId
    ? await prisma.fiscalReceipt.findUnique({ where: { id: result.receiptId }, select: { qrCodeData: true, receiptGlobalNo: true } })
    : null;
  return outcome(sale, {
    fiscalStatus: result.status,
    fiscalReceiptId: result.receiptId ?? null,
    fiscalNumber: result.fiscalNumber ?? null,
    qrCodeData: row?.qrCodeData ?? null,
    receiptGlobalNo: row?.receiptGlobalNo ?? null,
    providerReference: result.providerReference ?? null,
    fiscalError: result.heldSince ? heldReceiptWords(result.heldSince) : (result.error ?? null),
    errorCode: result.errorCode ?? null,
    blocksDevice: Boolean(result.errorCode && DEVICE_SCOPED_CODES.has(result.errorCode)),
  });
}

function signedReceiptOf(companyId: string, saleId: string) {
  return prisma.fiscalReceipt.findFirst({
    where: { companyId, retailSaleId: saleId, receiptGlobalNo: { not: null }, signature: { not: null } },
  });
}

/**
 * After a sale has committed: send the receipt its commit signed, or, for a
 * sale that waits, sign the waiting sales into the day that is open now
 * ({@link signWaitingSales}). Never decides a sale's day: that was settled
 * in its commit ({@link assignRetailSaleFiscalDay}), and `assigned` is what
 * it settled, when the caller has it. Run again by the fiscal worker and the
 * close for a receipt ZIMRA has not taken. Never throws for a fiscalisation
 * problem — every outcome is a value, because the caller is a till whose
 * money has already been taken.
 */
export async function fiscaliseRetailSale(input: {
  companyId: string;
  saleId: string;
  assigned?: RetailFiscalOutcome | null;
  /** A till's own sale: kept signed for the fiscal worker while FDMS is silent (SET-08). */
  holdWhileUnreachable?: boolean;
}): Promise<RetailFiscalOutcome> {
  const sale = await loadSale(input.companyId, input.saleId, prisma);
  if (!sale) {
    return outcome(
      { id: input.saleId, saleNo: null },
      { fiscalStatus: "FAILED", errorCode: "RETAIL_SALE_NOT_FOUND", fiscalError: "Sale not found for this company" },
    );
  }
  const hold = Boolean(input.holdWhileUnreachable);
  let receipt = await signedReceiptOf(input.companyId, sale.id);
  if (!receipt && sale.fiscalWaitsSince) {
    const placed = (await signWaitingSales(input.companyId)).find((result) => result.saleId === sale.id);
    if (placed) return placed;
    receipt = await signedReceiptOf(input.companyId, sale.id);
    if (!receipt) {
      const device = await tillDevice(input.companyId, prisma);
      const last = device ? await latestDay(prisma, device.id) : null;
      return input.assigned ?? waitsForDay(sale, last?.fiscalDayNo ?? 0);
    }
    // Signed by another caller's pass over the waiting sales, which sends it.
    return receiptOutcome(sale, receipt);
  }
  if (!receipt) {
    if (input.assigned) return input.assigned;
    if (!(await tillDevice(input.companyId, prisma))) return noDevice(sale);
    return outcome(sale, { fiscalStatus: "FAILED", errorCode: "RETAIL_SALE_NOT_SIGNED", fiscalError: saleNotSignedWords(sale.saleNo) });
  }
  // A sale that waited and was signed by another caller's pass: that pass sends it.
  if (input.assigned && input.assigned.fiscalReceiptId !== receipt.id) return receiptOutcome(sale, receipt);
  return sendSigned(sale, receipt, hold);
}

/** How many sales one pass over the waiting ones takes at most; the next pass takes the rest. */
const WAITING_PASS_LIMIT = 500;

/**
 * Sign the sales waiting for a day (rung while the last day's report was on
 * its way to ZIMRA) into the day that is open, opening the next one for them
 * when none is, oldest first — one sale per transaction, under the same lock
 * a sale takes, so nothing rung after them goes first (SET-08). Each is sent
 * once signed. Stops while a day is closing or the device cannot sign. Run by
 * the close once its report is taken or it gives the day back, by the retail
 * worker, and after a sale that waits has committed. Never throws; returns
 * what this call did with each sale it placed.
 */
export async function signWaitingSales(companyId: string): Promise<RetailFiscalOutcome[]> {
  const placed: RetailFiscalOutcome[] = [];
  try {
    for (let pass = 0; pass < WAITING_PASS_LIMIT; pass += 1) {
      const [next] = await waitingSales(companyId, { take: 1 });
      if (!next) break;
      const step = await prisma.$transaction(async (tx) => {
        // The sale first, then its day: the order a refund or a void of it takes them in.
        await tx.$queryRaw`SELECT "id" FROM "RetailSale" WHERE "id" = ${next.id} FOR UPDATE`;
        const device = await tillDevice(companyId, tx);
        const locked = device ? await lockDeviceDay(tx, device.id) : null;
        const [oldest] = await waitingSales(companyId, { take: 1 }, tx);
        if (oldest?.id !== next.id) return "again" as const;
        const sale = (await loadSale(companyId, next.id, tx))!;
        const result = device ? await placeSale(tx, device, locked, sale, { waitingFirst: false }) : noDevice(sale);
        if (isWaiting(result) || result.blocksDevice) return "stop" as const;
        await tx.retailSale.update({ where: { id: sale.id }, data: { fiscalWaitsSince: null } });
        return { result, sale };
      });
      if (step === "stop") break;
      if (step === "again") continue;
      const receipt = step.result.fiscalReceiptId ? await signedReceiptOf(companyId, step.sale.id) : null;
      placed.push(receipt ? await sendSigned({ ...step.sale, fiscalWaitsSince: null }, receipt, true) : step.result);
    }
  } catch (error) {
    console.error(`[retail] signing the sales waiting for a fiscal day failed (${companyId}):`, error);
  }
  return placed;
}

/**
 * Send a batch of committed sales' receipts in the order the till rang them
 * (a queue of sales), one at a time: each receipt's signature covers the one
 * before it, and one submission is on the wire at a time. Each sale's day
 * was settled in its own commit; `assigned` is what it settled.
 */
export async function fiscaliseRetailSales(input: {
  companyId: string;
  sales: Array<{ saleId: string; assigned?: RetailFiscalOutcome | null }>;
  holdWhileUnreachable?: boolean;
}): Promise<RetailFiscalOutcome[]> {
  const results: RetailFiscalOutcome[] = [];
  for (const { saleId, assigned } of input.sales) {
    try {
      results.push(
        await fiscaliseRetailSale({ companyId: input.companyId, saleId, assigned, holdWhileUnreachable: input.holdWhileUnreachable }),
      );
    } catch (error) {
      // Nothing a till does may turn a completed sale into an unhandled exception.
      results.push(
        outcome(
          { id: saleId, saleNo: null },
          { fiscalStatus: "FAILED", fiscalError: error instanceof Error ? error.message : "Fiscalisation failed" },
        ),
      );
    }
  }
  return results;
}

/**
 * What a till is told about a sale it has just posted: whether the sale is on
 * the fiscal chain, the number to print, and the QR to print under it.
 */
export type TillFiscalStatus = {
  status: RetailFiscalStatus;
  fiscalNumber: string | null;
  qrCodeData: string | null;
  error: string | null;
};

/**
 * Send the receipt of a sale, a refund or a void its commit signed, the
 * moment it is posted online, and answer in the till's terms. Never throws:
 * the money has been taken, and a receipt ZIMRA did not take is a row the
 * fiscal worker sends again.
 */
export async function fiscaliseAfterPosting(input: {
  companyId: string;
  saleId: string;
  assigned: RetailFiscalOutcome | null;
}): Promise<TillFiscalStatus> {
  try {
    const result = await fiscaliseRetailSale({ ...input, holdWhileUnreachable: true });
    return {
      status: result.fiscalStatus,
      fiscalNumber: result.fiscalNumber,
      qrCodeData: result.qrCodeData,
      error: result.fiscalStatus === "SKIPPED" ? null : result.fiscalError,
    };
  } catch (error) {
    return {
      status: "FAILED",
      fiscalNumber: null,
      qrCodeData: null,
      error: error instanceof Error ? error.message : "The sale was not fiscalised",
    };
  }
}

/**
 * "Keep selling, sign later" (SET-08): send a fiscal day's till receipts
 * ZIMRA has not taken yet again, oldest first — the same signed bytes, so the
 * day can close. Stops at the first one ZIMRA does not take: the rest would
 * meet the same silence, and each waits on its own for the fiscal worker.
 * Returns how many are still not taken, and the refusal it stopped at when it
 * was not ZIMRA's silence but the receipt itself (`errorCode`): one a person
 * has to put right, which no retry sends.
 */
export async function resendRetailReceipts(input: {
  companyId: string;
  fiscalDayId: string;
}): Promise<{ left: number; refused: RetailFiscalOutcome | null }> {
  const unsent = await prisma.fiscalReceipt.findMany({
    where: {
      companyId: input.companyId,
      fiscalDayId: input.fiscalDayId,
      retailSaleId: { not: null },
      status: { in: ["PENDING", "FAILED"] },
    },
    orderBy: [{ receiptGlobalNo: "asc" }],
    select: { retailSaleId: true },
  });
  let left = unsent.length;
  for (const receipt of unsent) {
    const result = await fiscaliseRetailSale({ companyId: input.companyId, saleId: receipt.retailSaleId! });
    if (result.fiscalStatus !== "SUCCESS") return { left, refused: result.errorCode ? result : null };
    left -= 1;
  }
  return { left, refused: null };
}

/**
 * A fiscal day's till receipts as the Z-report counts them: each receipt's
 * tax lines as it was signed (`FiscalReceipt.signedTax`, SET-08 "Close day"),
 * never rebuilt from the catalogue, so a rate edited after a sale leaves the
 * day's counters what ZIMRA was sent.
 */
export async function retailFiscalDayTaxLines(input: {
  companyId: string;
  fiscalDayId: string;
}): Promise<Record<string, Array<{ taxId: number; taxPercent: string | null; salesAmountCents: bigint; taxAmountCents: bigint }>>> {
  const receipts = await prisma.fiscalReceipt.findMany({
    where: { companyId: input.companyId, fiscalDayId: input.fiscalDayId, retailSaleId: { not: null } },
    select: { id: true, signedTax: true },
  });
  return Object.fromEntries(
    receipts
      .filter((receipt) => receipt.signedTax)
      .map((receipt) => [receipt.id, signedTaxLines(receipt.signedTax as SignedRetailTax)]),
  );
}
