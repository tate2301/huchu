/**
 * FD-3 — the ZIMRA receipt signature, its hash chain, and its counters.
 *
 * This is the one place a fiscal receipt is turned into the bytes ZIMRA
 * verifies. FDGA v7.2 does not trust the server to tell it what a receipt says:
 * the device signs a canonical string built from the receipt's own fields plus
 * the hash of the receipt before it, and FDMS re-derives that string from the
 * submitted payload and checks the signature against the device certificate. If
 * our concatenation differs from theirs by a byte — a space, a rounding cent, a
 * tax line in the wrong order — the receipt is rejected, and because the next
 * receipt chains onto this one's hash, every receipt after it is rejected too.
 * That is why this file is pure, dependency-free and separately tested: it has
 * no database, no transport and no clock of its own, so its behaviour can be
 * pinned exactly and re-derived years later during an audit.
 *
 * **Money is never a `number` here.** Every amount that reaches the canonical
 * string is a `Cents` — a branded `bigint` that can only be constructed through
 * `centsFromMinorUnits` or `centsFromDecimal`. Float arithmetic on a total is
 * how you get a signed receipt that disagrees with the printed one by a cent:
 * the customer holds a slip saying $10.30, ZIMRA holds a signature over
 * $10.29, and the invoice shows NOT VALID on the portal with no way to correct
 * it except a credit note. The branding makes that mistake a compile error, and
 * the runtime guards make it an exception for JavaScript callers.
 *
 * **Scope note.** The concatenation implemented here is the one FD-3 specifies:
 * device, type, currency, global number, date, total, then each tax line as
 * percent + amount, then the previous hash. Published v7.2 samples also carry
 * `salesAmountWithTax` per tax line; if the sandbox rejects a signature that is
 * otherwise correct, that is the first thing to add — change it HERE and
 * nowhere else, and re-pin the golden canonical string in the tests.
 *
 * Nothing writes a fiscal document outside this module's counters and chaining
 * (roadmap standing instruction: "the receipt hash chain is sacred").
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";

/** Raised for every refusal in this module, so callers can tell a signing
 *  refusal apart from a transport failure and never retry it blindly. */
export class FiscalSigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FiscalSigningError";
  }
}

declare const CENTS_BRAND: unique symbol;

/**
 * An exact minor-unit amount (cents for USD and ZWG alike).
 *
 * Branded so that a plain `bigint` — and therefore anything a float was
 * silently truncated into — cannot be passed where a signed amount is expected.
 * The only doors in are the two constructors below, and both are total: they
 * either produce an exact value or throw.
 */
export type Cents = bigint & { readonly [CENTS_BRAND]: true };

/** ZIMRA's three receipt kinds. A debit note is a sales document in v7.2. */
export type ReceiptType = "FISCALINVOICE" | "CREDITNOTE" | "DEBITNOTE";

/** A tax percentage as it may reach us: `TaxCode.rate` is a Float column, so
 *  a `number` is allowed here — a percentage is not a total and is never
 *  summed. `null` is the exempt/zero-rated case, which carries no percent. */
export type TaxPercentInput = number | string | Prisma.Decimal | null | undefined;

export type ReceiptTaxLine = {
  /** `TaxCode.zimraTaxId` (FD-0.2). The sort key of the canonical string, and
   *  the key ZIMRA aggregates the fiscal day's counters by. */
  taxId: number;
  /** Omitted from the canonical string when null — an exempt line has no rate. */
  taxPercent?: TaxPercentInput;
  taxAmount: Cents;
};

export type ReceiptCanonicalInput = {
  /** The numeric ZIMRA device ID, as registered. */
  deviceId: number | string;
  receiptType: ReceiptType;
  /** ISO 4217, e.g. USD or ZWG. */
  receiptCurrency: string;
  /** Device-lifetime receipt number; see {@link nextCounters}. */
  receiptGlobalNo: number;
  /**
   * The fiscal date. A `string` must already be `yyyy-MM-dd`; a `Date` is
   * formatted in Zimbabwe local time, because a fiscal day is a Zimbabwean
   * calendar day — a 22:30 CAT sale is 20:30 UTC on the same date, but a 01:00
   * CAT sale is 23:00 UTC on the *previous* one, and dating it in UTC would
   * sign it into a day ZIMRA has already closed.
   */
  receiptDate: string | Date;
  /** Signed total including tax. Negative for a credit note. */
  receiptTotal: Cents;
  /** At least one line, one per distinct taxID, already aggregated. */
  taxes: ReceiptTaxLine[];
  /** Hash of receipt N-1 on this device; empty/null only for its very first. */
  previousReceiptHash?: string | null;
};

export type ReceiptCounters = {
  /** Position within the fiscal day. Resets to 1 on each day's first receipt. */
  receiptCounter: number;
  /** Position on the device for all time. Never resets, never skips. */
  receiptGlobalNo: number;
};

/** The DER prefix of a PKCS#1 v1.5 DigestInfo for SHA-256. Prepending it to a
 *  bare digest and RSA-encrypting with the private key is, byte for byte, an
 *  "RSA-SHA256" signature — which is how a signature we produce from a *hash*
 *  (what v7.2 specifies) still verifies with any standard verifier fed the
 *  original canonical string. The signing tests assert exactly that. */
const SHA256_DIGESTINFO_PREFIX = Buffer.from(
  "3031300d060960864801650304020105000420",
  "hex",
);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Build a `Cents` from an amount already expressed in minor units.
 *
 * A `number` is accepted only if it is a safe integer: an integral count of
 * cents is exactly representable, so no precision is at stake, while `10.5`
 * (someone's dollars, or a float that drifted) is refused rather than silently
 * floored into a signature.
 */
export function centsFromMinorUnits(value: bigint | number): Cents {
  if (typeof value === "bigint") return value as Cents;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new FiscalSigningError(
      `Fiscal amount must be an exact number of cents, received ${String(value)}`,
    );
  }
  return BigInt(value) as Cents;
}

/**
 * Build a `Cents` from a major-unit Decimal (dollars, ZiG).
 *
 * Refuses anything finer than a cent instead of rounding it. A third decimal
 * place in a fiscal total means the caller's arithmetic is wrong, and rounding
 * it here would hide that inside a signature that can no longer be corrected.
 */
export function centsFromDecimal(value: Prisma.Decimal | string): Cents {
  const decimal =
    value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  if (!decimal.isFinite()) {
    throw new FiscalSigningError("Fiscal amount must be finite");
  }
  const minor = decimal.times(100);
  if (!minor.isInteger()) {
    throw new FiscalSigningError(
      `Fiscal amount ${decimal.toString()} is finer than one cent and cannot be signed`,
    );
  }
  return BigInt(minor.toFixed(0)) as Cents;
}

function assertCents(value: Cents, field: string): bigint {
  if (typeof value !== "bigint") {
    throw new FiscalSigningError(
      `${field} must be Cents (use centsFromMinorUnits/centsFromDecimal), received ${typeof value}`,
    );
  }
  return value;
}

/**
 * `yyyy-MM-dd` in Zimbabwe local time.
 *
 * Exported because the fiscal-day service needs the same answer this module
 * signs: if the two disagree at a midnight boundary the receipt lands in a
 * different day than the one whose counters were incremented.
 */
export function formatReceiptDate(date: Date, timeZone = "Africa/Harare"): string {
  if (Number.isNaN(date.getTime())) {
    throw new FiscalSigningError("receiptDate is an invalid Date");
  }
  // en-CA renders yyyy-MM-dd, which is the format ZIMRA signs.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normaliseReceiptDate(value: string | Date): string {
  if (value instanceof Date) return formatReceiptDate(value);
  if (!ISO_DATE_RE.test(value)) {
    throw new FiscalSigningError(
      `receiptDate must be yyyy-MM-dd, received "${value}"`,
    );
  }
  return value;
}

function normaliseDeviceId(value: number | string): string {
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || text.length === 0) {
    throw new FiscalSigningError(`deviceId must be numeric, received "${text}"`);
  }
  // Leading zeros are stripped: the signature carries the device's number, and
  // the zero padding belongs to the QR URL alone (see buildVerificationQrUrl).
  return String(BigInt(text));
}

function formatTaxPercent(value: TaxPercentInput): string {
  if (value === null || value === undefined || value === "") return "";
  const decimal =
    value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new FiscalSigningError(
      `taxPercent must be a non-negative finite rate, received ${String(value)}`,
    );
  }
  if (decimal.decimalPlaces() > 2) {
    throw new FiscalSigningError(
      `taxPercent ${decimal.toString()} has more than two decimal places and would be rounded inside a signature`,
    );
  }
  return decimal.toFixed(2);
}

function normaliseTaxLines(taxes: ReceiptTaxLine[]): string {
  if (!Array.isArray(taxes) || taxes.length === 0) {
    throw new FiscalSigningError("A receipt must carry at least one tax line");
  }

  const seen = new Set<number>();
  const lines = taxes.map((line) => {
    if (!Number.isInteger(line.taxId) || line.taxId < 0) {
      throw new FiscalSigningError(
        `taxId must be a non-negative integer (TaxCode.zimraTaxId), received ${String(line.taxId)}`,
      );
    }
    // Duplicate IDs would make the concatenation order-dependent among equals,
    // and ZIMRA aggregates the fiscal day by taxID anyway — one line per ID is
    // the only shape whose day counters can reconcile.
    if (seen.has(line.taxId)) {
      throw new FiscalSigningError(
        `Duplicate taxId ${line.taxId}: aggregate tax lines by taxID before signing`,
      );
    }
    seen.add(line.taxId);
    return {
      taxId: line.taxId,
      percent: formatTaxPercent(line.taxPercent),
      amount: assertCents(line.taxAmount, `taxAmount for taxId ${line.taxId}`),
    };
  });

  // taxID orders the lines but is not itself concatenated — v7.2 signs the rate
  // and the amount. Renumbering a line without changing either therefore signs
  // the same string, which is correct: what ties a line to a ZIMRA tax is the
  // FD-0.2 mapping checked before signing, and the fiscal day's counters, which
  // ARE aggregated by taxID.
  lines.sort((a, b) => a.taxId - b.taxId);
  return lines.map((line) => `${line.percent}${line.amount.toString()}`).join("");
}

/**
 * The exact string ZIMRA signs and re-derives.
 *
 * Concatenated with no separators — the field order and the formatting *are*
 * the delimiters, which is why every component is normalised here rather than
 * trusted from the caller. Sorting the tax lines by taxID is not cosmetic:
 * FDMS sorts them the same way before verifying, so a payload built in a
 * different order signs a different string and fails verification with no
 * useful error.
 */
export function buildReceiptCanonicalString(input: ReceiptCanonicalInput): string {
  const receiptType = String(input.receiptType ?? "").toUpperCase();
  if (
    receiptType !== "FISCALINVOICE" &&
    receiptType !== "CREDITNOTE" &&
    receiptType !== "DEBITNOTE"
  ) {
    throw new FiscalSigningError(
      `receiptType must be FISCALINVOICE, CREDITNOTE or DEBITNOTE, received "${String(input.receiptType)}"`,
    );
  }

  const currency = String(input.receiptCurrency ?? "").trim().toUpperCase();
  if (!CURRENCY_RE.test(currency)) {
    throw new FiscalSigningError(
      `receiptCurrency must be a three-letter ISO code, received "${String(input.receiptCurrency)}"`,
    );
  }

  if (!Number.isInteger(input.receiptGlobalNo) || input.receiptGlobalNo < 1) {
    throw new FiscalSigningError(
      `receiptGlobalNo must be a positive integer, received ${String(input.receiptGlobalNo)}`,
    );
  }

  const deviceId = normaliseDeviceId(input.deviceId);
  const receiptDate = normaliseReceiptDate(input.receiptDate);
  const total = assertCents(input.receiptTotal, "receiptTotal");
  const taxes = normaliseTaxLines(input.taxes);
  // The first receipt of a device has nothing to chain onto, and ZIMRA signs
  // the empty string for it. Every later empty value is a bug the chain
  // verifier catches, not something to paper over here.
  const previous = String(input.previousReceiptHash ?? "");

  return [
    deviceId,
    receiptType,
    currency,
    String(input.receiptGlobalNo),
    receiptDate,
    total.toString(),
    taxes,
    previous,
  ].join("");
}

/** SHA-256 of the canonical string, base64 — this is the value the *next*
 *  receipt carries as its `previousReceiptHash`, so it is the chain link. */
export function hashReceipt(canonical: string): string {
  if (typeof canonical !== "string" || canonical.length === 0) {
    throw new FiscalSigningError("Cannot hash an empty canonical string");
  }
  return crypto.createHash("sha256").update(canonical, "utf8").digest("base64");
}

/** Convenience: canonical + hash in one call, so no caller can hash a string
 *  it built itself. */
export function hashReceiptInput(input: ReceiptCanonicalInput): string {
  return hashReceipt(buildReceiptCanonicalString(input));
}

function decodeHash(hash: string): Buffer {
  if (typeof hash !== "string" || hash.length === 0) {
    throw new FiscalSigningError("Receipt hash is required");
  }
  const digest = Buffer.from(hash, "base64");
  if (digest.length !== 32) {
    throw new FiscalSigningError(
      `Receipt hash must be a base64 SHA-256 digest (32 bytes), received ${digest.length}`,
    );
  }
  return digest;
}

/**
 * Sign a receipt hash with the device private key. Base64, RSA PKCS#1 v1.5
 * over SHA-256.
 *
 * v7.2 signs the *hash*, not the string, so the input is the hash — but the
 * bytes produced are an ordinary RSA-SHA256 signature over the canonical
 * string, because the DigestInfo prefix is what makes those two things the same
 * operation. That matters for verification: ZIMRA (and our own auditors) can
 * check it with any off-the-shelf verifier and the device certificate.
 */
export function signReceipt(
  hash: string,
  privateKeyPem: string,
  options?: { passphrase?: string },
): string {
  const digest = decodeHash(hash);
  if (typeof privateKeyPem !== "string" || privateKeyPem.trim().length === 0) {
    throw new FiscalSigningError("Device private key is required to sign a receipt");
  }

  let key: crypto.KeyObject;
  try {
    key = crypto.createPrivateKey(
      options?.passphrase
        ? { key: privateKeyPem, passphrase: options.passphrase }
        : privateKeyPem,
    );
  } catch (error) {
    throw new FiscalSigningError(
      `Device private key could not be read: ${(error as Error).message}`,
    );
  }
  if (key.asymmetricKeyType !== "rsa") {
    throw new FiscalSigningError(
      `Device key must be RSA (ZIMRA issues RSA certificates), received ${String(key.asymmetricKeyType)}`,
    );
  }

  const signature = crypto.privateEncrypt(
    { key, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.concat([SHA256_DIGESTINFO_PREFIX, digest]),
  );
  return signature.toString("base64");
}

/**
 * Check a receipt signature against a public key or certificate.
 *
 * Used by the tests and by any later self-audit that has to prove a stored
 * receipt was signed by the certificate on file — for example after a
 * certificate rotation, where a receipt signed by the retired key must still
 * verify against the retired key and not the new one.
 */
export function verifyReceiptSignature(input: {
  hash: string;
  signature: string;
  publicKeyPem: string;
}): boolean {
  let digestInfo: Buffer;
  try {
    digestInfo = Buffer.concat([SHA256_DIGESTINFO_PREFIX, decodeHash(input.hash)]);
  } catch {
    return false;
  }
  try {
    const recovered = crypto.publicDecrypt(
      {
        key: crypto.createPublicKey(input.publicKeyPem),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(input.signature, "base64"),
    );
    return (
      recovered.length === digestInfo.length &&
      crypto.timingSafeEqual(recovered, digestInfo)
    );
  } catch {
    // A wrong key fails PKCS#1 unpadding rather than mismatching — either way
    // the answer is "not signed by this key".
    return false;
  }
}

/**
 * The FDMS verification URL rendered as the invoice QR.
 *
 * The portal looks the receipt up by the exact concatenation below, so the zero
 * padding is load-bearing: device ID to 10 digits, date as `ddMMyyyy`, global
 * number to 10 digits, then the first 16 hex characters of the MD5 of the *raw
 * signature bytes* (not of its base64 text — decoding first is the step that is
 * easy to get wrong and impossible to notice, because the URL still looks
 * plausible and simply resolves to nothing).
 */
export function buildVerificationQrUrl(input: {
  portalBase: string;
  deviceId: number | string;
  receiptDate: string | Date;
  receiptGlobalNo: number;
  /** Base64 signature as returned by {@link signReceipt}. */
  signature: string;
}): string {
  const base = String(input.portalBase ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new FiscalSigningError("portalBase is required to build a verification URL");
  }
  if (!Number.isInteger(input.receiptGlobalNo) || input.receiptGlobalNo < 1) {
    throw new FiscalSigningError(
      `receiptGlobalNo must be a positive integer, received ${String(input.receiptGlobalNo)}`,
    );
  }
  const deviceId = normaliseDeviceId(input.deviceId).padStart(10, "0");
  const [year, month, day] = normaliseReceiptDate(input.receiptDate).split("-");

  const signatureBytes = Buffer.from(String(input.signature ?? ""), "base64");
  if (signatureBytes.length === 0) {
    throw new FiscalSigningError("A signature is required to build a verification URL");
  }
  const code = crypto
    .createHash("md5")
    .update(signatureBytes)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  const globalNo = String(input.receiptGlobalNo).padStart(10, "0");
  return `${base}/${deviceId}${day}${month}${year}${globalNo}${code}`;
}

function assertCounter(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new FiscalSigningError(
      `${field} must be a non-negative integer, received ${String(value)}`,
    );
  }
  return value;
}

/**
 * Allocate the next receipt's counters from the previous pair.
 *
 * Both advance by exactly one. `receiptCounter` is the receipt's place in the
 * fiscal day and `receiptGlobalNo` its place on the device for all time, so a
 * new day arrives here as a pair whose counter is 0 and whose global number is
 * carried over (see {@link openFiscalDayCounters}) — that is the entire day
 * boundary. Nothing derives these with a MAX() over the receipts table: a gap
 * reads to ZIMRA as a receipt we hid, and a repeat as a forgery, so the
 * allocation belongs to a single locked row update in the fiscal-day service
 * with this function as its only arithmetic.
 */
export function nextCounters(previous?: ReceiptCounters | null): ReceiptCounters {
  if (!previous) return { receiptCounter: 1, receiptGlobalNo: 1 };

  const counter = assertCounter(previous.receiptCounter, "receiptCounter");
  const globalNo = assertCounter(previous.receiptGlobalNo, "receiptGlobalNo");
  // The day counter can never have run ahead of the device's lifetime count;
  // if it has, the two were swapped or read from different devices, and
  // continuing would fork the chain.
  if (counter > globalNo) {
    throw new FiscalSigningError(
      `receiptCounter (${counter}) cannot exceed receiptGlobalNo (${globalNo})`,
    );
  }

  return { receiptCounter: counter + 1, receiptGlobalNo: globalNo + 1 };
}

/**
 * The counters a freshly opened fiscal day starts from: the day resets, the
 * device does not.
 */
export function openFiscalDayCounters(
  previousDay?: ReceiptCounters | null,
): ReceiptCounters {
  if (!previousDay) return { receiptCounter: 0, receiptGlobalNo: 0 };
  return {
    receiptCounter: 0,
    receiptGlobalNo: assertCounter(previousDay.receiptGlobalNo, "receiptGlobalNo"),
  };
}

export type ChainLink = {
  input: ReceiptCanonicalInput;
  /** The hash as stored on `FiscalReceipt.receiptHash`. */
  receiptHash: string;
};

export type ChainVerification =
  | { ok: true }
  | { ok: false; index: number; reason: string };

/**
 * Re-derive a run of receipts and prove the chain is intact.
 *
 * This is the audit that makes the chain worth having: it recomputes each
 * receipt's hash from its own stored fields, so a receipt edited after signing
 * no longer matches, and it checks that each receipt names its predecessor's
 * hash and takes the next global number. Tampering with a receipt in the middle
 * is therefore detected at that receipt — the recomputed hash diverges — and
 * not merely at the end of the run.
 */
export function verifyReceiptChain(
  links: ChainLink[],
  options?: { expectedFirstPreviousHash?: string | null },
): ChainVerification {
  let expectedPrevious = String(options?.expectedFirstPreviousHash ?? "");
  let expectedGlobalNo: number | null = null;

  for (let index = 0; index < links.length; index += 1) {
    const link = links[index];
    const declaredPrevious = String(link.input.previousReceiptHash ?? "");

    if (declaredPrevious !== expectedPrevious) {
      return {
        ok: false,
        index,
        reason: `previousReceiptHash does not match receipt ${index - 1}: chain is forked`,
      };
    }
    if (expectedGlobalNo !== null && link.input.receiptGlobalNo !== expectedGlobalNo) {
      return {
        ok: false,
        index,
        reason: `receiptGlobalNo ${link.input.receiptGlobalNo} is not ${expectedGlobalNo}: chain has a gap`,
      };
    }

    const recomputed = hashReceiptInput(link.input);
    if (recomputed !== link.receiptHash) {
      return {
        ok: false,
        index,
        reason: "stored receiptHash does not match the receipt's own fields: receipt was altered after signing",
      };
    }

    expectedPrevious = link.receiptHash;
    expectedGlobalNo = link.input.receiptGlobalNo + 1;
  }

  return { ok: true };
}
