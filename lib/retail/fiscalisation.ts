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
 * ## Ordering: sequential, and a refusal is not a gap
 *
 * {@link fiscaliseRetailSales} processes a batch **one sale at a time, in the
 * order the till rang them**. Never `Promise.all`: each receipt's signature
 * covers the previous receipt's hash, so they genuinely cannot be signed in
 * parallel — the fiscal day's row lock would serialise them anyway, but in an
 * order nobody chose, which would put the 14:00 sale in front of the 09:05 one
 * in the chain that gets audited.
 *
 * One failure does not abandon the rest of the batch, and the reason it is safe
 * not to is the shape of the two failure kinds:
 *
 *   * *A refusal about this sale* (unmapped rate, inconsistent totals, a
 *     reversal with no original) happens **before a number is reserved**.
 *     Nothing was signed, so the sale has no place in the chain to leave a gap
 *     in, and the next sale simply takes the next number. The batch continues —
 *     one bad SKU must not stop a shop trading.
 *   * *A failure about the device* (no fiscal day open, no device key, chain out
 *     of order) would hit every remaining sale identically. The drain **halts**
 *     and the rest are reported SKIPPED with the same reason, so nothing is
 *     signed onto a chain that is already known to be broken.
 *
 * A transport failure is neither: `issueFiscalDocument` has already reserved
 * the number, signed the bytes and committed the row before the network is
 * touched, so the receipt holds its place in the chain and replay resends the
 * *same* signed bytes. The drain continues past it deliberately — that is the
 * offline promise working, not failing.
 *
 * ## What is deliberately not decided here
 *
 * ZIMRA's permitted offline window (master-plan risk #8) is still open. Every
 * receipt is dated with the sale's own `postedAt`, because that is what the
 * customer holds a slip for, and a drain that lands those in a fiscal day
 * opened later is exactly the case that decision has to settle. Nothing here
 * silently redates a sale to make it fit.
 */
import type { RetailSale, RetailSaleLine } from "@prisma/client";
import { money, percent, toNumberOrZero, type MoneyLike } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import {
  FiscalMappingError,
  centsFromDecimalAmount,
  issueFiscalDocument,
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
   * than of this sale: every later sale in the drain would fail the same way,
   * so the drain stops instead of signing onto a chain already known broken.
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
export async function loadRetailTaxResolver(input: {
  companyId: string;
  asOf: Date;
}): Promise<RetailTaxResolver> {
  const codes = await prisma.taxCode.findMany({
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
  const receiptTotal = centsFromDecimalAmount(
    money(sale.totalAmount),
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
    const taxCents = centsFromDecimalAmount(
      money(line.taxAmount),
      `tax on ${line.itemName} (${sale.saleNo})`,
    );
    const lineCents = centsFromDecimalAmount(
      money(line.lineTotal),
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

  const declaredTaxCents = centsFromDecimalAmount(
    money(sale.taxAmount),
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
      // The sale's own timestamp, not "now": a queued sale is dated when it was
      // rung, because that is the date on the slip the customer walked out with
      // and the date a portal lookup has to match.
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
): Promise<RetailSaleLineForSigning[]> {
  const productIds = [
    ...new Set(sale.lines.map((line) => line.productId).filter((id): id is string => Boolean(id))),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
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
): Promise<CreditedReceiptReference | null> {
  if (!sale.sourceSaleId) return null;

  const original = await prisma.retailSale.findFirst({
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

/** Whether this tenant fiscalises at all, answered with one indexed read.
 *
 *  The gate is the *device*, not a billing flag: a shop with a registered ZIMRA
 *  device is required to fiscalise what it sells whatever an entitlement says,
 *  and a shop without one has nothing to send to. A missing provider config is
 *  therefore SKIPPED and silent, not FAILED. */
async function hasFiscalDevice(companyId: string): Promise<boolean> {
  const provider = await prisma.fiscalisationProviderConfig.findFirst({
    where: { companyId, isActive: true },
    select: { id: true },
  });
  return Boolean(provider);
}

/**
 * Fiscalise one posted till sale. Never throws for a fiscalisation problem —
 * every outcome is a value, because the caller is a till whose money has
 * already been taken.
 */
export async function fiscaliseRetailSale(input: {
  companyId: string;
  saleId: string;
}): Promise<RetailFiscalOutcome> {
  const sale = (await prisma.retailSale.findFirst({
    where: { id: input.saleId, companyId: input.companyId },
    include: SALE_INCLUDE,
  })) as LoadedSale | null;

  if (!sale) {
    return outcome(
      { id: input.saleId, saleNo: null },
      {
        fiscalStatus: "FAILED",
        errorCode: "RETAIL_SALE_NOT_FOUND",
        fiscalError: "Sale not found for this company",
      },
    );
  }

  // A sale that was voided before it was ever drained was never given to ZIMRA
  // and never should be: the reversal that voided it is skipped for the same
  // reason, and the day's counters stay clean.
  if (sale.status !== "POSTED") {
    return outcome(sale, {
      fiscalStatus: "SKIPPED",
      fiscalError: `Sale ${sale.saleNo} is ${sale.status} and is not fiscalised`,
    });
  }

  if (!(await hasFiscalDevice(input.companyId))) {
    return outcome(sale, {
      fiscalStatus: "SKIPPED",
      fiscalError: "No active fiscalisation device is configured for this company",
    });
  }

  const receiptDate = sale.postedAt ?? sale.createdAt;

  let bundle: RetailSigningBundle;
  let credited: CreditedReceiptReference | null = null;
  let lines: RetailSaleLineForSigning[];
  try {
    if (sale.saleType !== "SALE") {
      credited = await loadCreditedReceipt(input.companyId, sale);
      if (!credited) {
        // Nothing at ZIMRA to reduce. Not a failure: the original never got
        // there, so the reversal has nothing to say.
        return outcome(sale, {
          fiscalStatus: "SKIPPED",
          fiscalError: `Sale ${sale.saleNo} reverses a sale that was never fiscalised, so no credit note is due`,
        });
      }
    }

    lines = await resolveLineRates(input.companyId, sale);
    const resolver = await loadRetailTaxResolver({
      companyId: input.companyId,
      asOf: receiptDate,
    });
    bundle = buildRetailSaleSigningInput({
      sale: { ...sale, receiptDate },
      lines,
      resolver,
    });
  } catch (error) {
    if (error instanceof RetailFiscalMappingError) {
      return outcome(sale, {
        fiscalStatus: "FAILED",
        errorCode: error.code,
        fiscalError: error.message,
      });
    }
    if (error instanceof FiscalMappingError) {
      return outcome(sale, {
        fiscalStatus: "FAILED",
        errorCode: error.code,
        fiscalError: error.message,
      });
    }
    // The float boundary refusing an amount finer than a cent. Named rather
    // than thrown, so a till gets told which sale and why.
    if (error instanceof FiscalSigningError) {
      return outcome(sale, {
        fiscalStatus: "FAILED",
        errorCode: "FISCAL_SIGNING_REFUSED",
        fiscalError: error.message,
      });
    }
    throw error;
  }

  const supplier = await prisma.accountingSettings.findUnique({
    where: { companyId: input.companyId },
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

  const result = await issueFiscalDocument({
    companyId: input.companyId,
    source: { kind: "RETAIL_SALE", retailSaleId: sale.id },
    documentNumber: sale.saleNo,
    // Namespaced: a till sale id and an invoice id are both uuids and the
    // provider sees only this string.
    idempotencyKey: `${input.companyId}:retail-sale:${sale.id}`,
    payload: buildRetailSalePayload({
      sale,
      lines,
      taxLines: bundle.taxLines,
      credited,
      supplier,
    }),
    fiscal: bundle.fiscal,
  });

  // Read back what the signer wrote. The QR and the global number exist from
  // the moment the receipt is signed — before FDMS has answered — which is what
  // lets a till print a scannable slip while it is still PENDING.
  const row = result.receiptId
    ? await prisma.fiscalReceipt.findUnique({
        where: { id: result.receiptId },
        select: { qrCodeData: true, receiptGlobalNo: true },
      })
    : null;

  return outcome(sale, {
    fiscalStatus: result.status,
    fiscalReceiptId: result.receiptId ?? null,
    fiscalNumber: result.fiscalNumber ?? null,
    qrCodeData: row?.qrCodeData ?? null,
    receiptGlobalNo: row?.receiptGlobalNo ?? null,
    providerReference: result.providerReference ?? null,
    fiscalError: result.error ?? null,
    errorCode: result.errorCode ?? null,
    blocksDevice: Boolean(result.errorCode && DEVICE_SCOPED_CODES.has(result.errorCode)),
  });
}

/**
 * Drain a batch of queued sales onto the fiscal chain, in the order they were
 * rung.
 *
 * Sequential by contract, not by accident — see the module header. The halt
 * rule is the other half of it: a refusal about one sale skips that sale and
 * the drain carries on, while a failure about the device stops the drain and
 * reports the remainder as SKIPPED with the same reason, so nothing is signed
 * onto a chain already known to be broken.
 */
export async function fiscaliseRetailSales(input: {
  companyId: string;
  saleIds: string[];
}): Promise<RetailFiscalOutcome[]> {
  const results: RetailFiscalOutcome[] = [];
  let halted: RetailFiscalOutcome | null = null;

  for (const saleId of input.saleIds) {
    if (halted) {
      results.push(
        outcome(
          { id: saleId, saleNo: null },
          {
            fiscalStatus: "SKIPPED",
            errorCode: halted.errorCode,
            fiscalError: `Fiscalisation stopped at sale ${halted.saleNo ?? halted.saleId}: ${halted.fiscalError ?? "device unavailable"}`,
          },
        ),
      );
      continue;
    }

    let result: RetailFiscalOutcome;
    try {
      result = await fiscaliseRetailSale({ companyId: input.companyId, saleId });
    } catch (error) {
      // Nothing a till does may turn a completed sale into an unhandled
      // exception. An unexpected throw is treated as device-scoped, because we
      // do not know what state the chain is in and guessing wrong signs the
      // next sale onto it.
      result = outcome(
        { id: saleId, saleNo: null },
        {
          fiscalStatus: "FAILED",
          fiscalError: error instanceof Error ? error.message : "Fiscalisation failed",
          blocksDevice: true,
        },
      );
    }

    results.push(result);
    if (result.blocksDevice) halted = result;
  }

  return results;
}
