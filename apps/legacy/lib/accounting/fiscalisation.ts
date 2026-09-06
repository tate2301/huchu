import type { FiscalDay, FiscalReceipt, FiscalisationProviderConfig, Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import {
  issueWithFdmsConnector,
  resolveDeviceSigningKey,
  submitReceiptPath,
  syncWithFdmsConnector,
} from "@/lib/accounting/fdms-connector";
import {
  FiscalDayError,
  FiscalDayNotOpenError,
  getOpenFiscalDay,
  recordReceiptHash,
  reserveNextReceiptNumbers,
} from "@/lib/accounting/fiscal-day";
import {
  FiscalSigningError,
  buildVerificationQrUrl,
  centsFromMinorUnits,
  hashReceiptInput,
  signReceipt,
  type Cents,
  type ReceiptCanonicalInput,
  type ReceiptTaxLine,
  type ReceiptType,
} from "@/lib/accounting/fdms-receipt-signing";

export type FiscalValidationResult = {
  ok: boolean;
  missing: string[];
};

/**
 * S-2.7 / FD-0.4 — which document a fiscal receipt was issued for.
 *
 * There are four, and there will not be a fifth without another column: a
 * `FiscalReceipt` row names exactly one, held by the
 * `FiscalReceipt_one_source_check` constraint. The accounting module fiscalises
 * a `SalesInvoice` at the moment it is issued; a school fiscalises a
 * `SchoolFeeReceipt` at the moment the money is taken, because that is the
 * document the parent is handed; v7.2 treats a `CreditNote` as a fiscal
 * document in its own right (it cites the original receipt's global number);
 * and a `RetailSale` is the till receipt, which is the highest-volume fiscal
 * surface there is.
 */
export type FiscalDocumentSource =
  | { kind: "SALES_INVOICE"; invoiceId: string }
  | { kind: "SCHOOL_FEE_RECEIPT"; schoolReceiptId: string }
  | { kind: "CREDIT_NOTE"; creditNoteId: string }
  | { kind: "RETAIL_SALE"; retailSaleId: string };

/**
 * A named refusal code, so a caller (or a replay pass) can tell "this will
 * never work until a human does something" apart from "FDMS was down".
 * Everything here is the former: nothing with a code retried itself, and
 * nothing with a code was sent.
 */
export type FiscalIssueErrorCode =
  | "FISCAL_DAY_NOT_OPEN"
  | "FISCAL_SIGNING_INPUT_REQUIRED"
  | "FISCAL_DEVICE_KEY_MISSING"
  | "FISCAL_SIGNING_REFUSED"
  | "FISCAL_TAX_CODE_UNMAPPED"
  | "FISCAL_RECEIPT_ALTERED"
  | "FISCAL_CHAIN_OUT_OF_ORDER";

export type FiscalIssueResult = {
  status: "SUCCESS" | "PENDING" | "FAILED";
  receiptId?: string;
  providerKey?: string | null;
  fiscalNumber?: string | null;
  providerReference?: string | null;
  error?: string;
  /** Set only for a refusal this module made itself; absent for a transport
   *  failure, which is retryable and carries `nextRetryAt` on the row. */
  errorCode?: FiscalIssueErrorCode;
};

/**
 * The facts ZIMRA signs, supplied by whoever knows what the document is.
 *
 * Supplying this is what engages the native protocol for a document (see
 * {@link issueFiscalDocument}). It is deliberately not derivable from the
 * generic `payload`: the canonical string is a byte-exact contract and guessing
 * a total or a tax rate out of a free-form object is how a receipt gets signed
 * for an amount nobody printed.
 */
export type FiscalSigningInput = {
  receiptType: ReceiptType;
  /** ISO 4217. USD or ZWG today. */
  receiptCurrency: string;
  /** The document's own date. Formatted in Zimbabwe local time when a `Date`. */
  receiptDate: Date | string;
  /** Signed total including tax, exact. Negative for a credit note. */
  receiptTotal: Cents;
  /** One line per distinct ZIMRA taxID, already aggregated. */
  taxes: ReceiptTaxLine[];
};

/** Raised while mapping a source document onto {@link FiscalSigningInput}. */
export class FiscalMappingError extends Error {
  readonly code: FiscalIssueErrorCode;

  constructor(code: FiscalIssueErrorCode, message: string) {
    super(message);
    this.name = "FiscalMappingError";
    this.code = code;
  }
}

/** ZIMRA's public verification portal — the base of every receipt QR. */
const DEFAULT_QR_PORTAL_BASE = "https://fdms.zimra.co.zw";

export function sourceWhere(
  source: FiscalDocumentSource,
): Prisma.FiscalReceiptWhereUniqueInput {
  switch (source.kind) {
    case "SALES_INVOICE":
      return { invoiceId: source.invoiceId };
    case "SCHOOL_FEE_RECEIPT":
      return { schoolReceiptId: source.schoolReceiptId };
    case "CREDIT_NOTE":
      return { creditNoteId: source.creditNoteId };
    case "RETAIL_SALE":
      return { retailSaleId: source.retailSaleId };
  }
}

/**
 * The one source column this document sets. Exactly one, never two — the
 * database refuses the rest, and this switch is what keeps the code from ever
 * asking it to.
 */
function sourceData(source: FiscalDocumentSource) {
  switch (source.kind) {
    case "SALES_INVOICE":
      return { invoiceId: source.invoiceId };
    case "SCHOOL_FEE_RECEIPT":
      return { schoolReceiptId: source.schoolReceiptId };
    case "CREDIT_NOTE":
      return { creditNoteId: source.creditNoteId };
    case "RETAIL_SALE":
      return { retailSaleId: source.retailSaleId };
  }
}

function tryParseJson(value?: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function qrPortalBase(provider: FiscalisationProviderConfig): string {
  const metadata = tryParseJson(provider.metadataJson) ?? {};
  const configured =
    (typeof metadata.qrPortalBase === "string" && metadata.qrPortalBase) ||
    (typeof metadata.portalBase === "string" && metadata.portalBase) ||
    "";
  return configured || DEFAULT_QR_PORTAL_BASE;
}

/**
 * FD-0.3 boundary — an accounting Float becomes exact cents, or it is refused.
 *
 * Accounting money is `Float` in this schema today (the Gold module's Decimal
 * columns are the precedent for changing that, and FD-0.3 owns the migration).
 * Until it moves, every fiscal total crosses from double to `Cents` here and
 * only here.
 *
 * The rule is "undo the representation, refuse the arithmetic": a double that
 * is within a whisker of a whole number of cents *is* that number of cents —
 * `0.1 + 0.2` is the ledger's 0.30 for every other purpose, and refusing to
 * sign it would strand a real invoice — while anything a measurable distance
 * from a cent (0.005, a third of a dollar) is a genuine precision error and is
 * thrown rather than rounded into a signature that cannot be corrected
 * afterwards. Note that `new Prisma.Decimal(0.30000000000000004)` preserves the
 * noise exactly, which is why the conversion is done in doubles and checked,
 * rather than handed to Decimal and hoped over.
 */
const CENT_EPSILON = 1e-6;

/**
 * The same boundary, for money that is already exact.
 *
 * Retail's money columns are `Decimal(14,2)` — R-1.1 converted 29 of them and
 * S-1 finished the job — and a `Decimal` has no representation error to undo.
 * Sending it through `centsFromAccountingAmount` would mean `.toNumber()`,
 * `× 100` in a double, and an epsilon test: three steps to recover a number
 * that was never lost, on the one figure ZIMRA's signature is computed over.
 *
 * So this multiplies in `Decimal` and refuses anything that is not a whole
 * number of cents. No epsilon, because there is nothing to forgive: a
 * `Decimal(14,2)` finer than a cent did not come from a double, it came from
 * arithmetic that should have been rounded and was not.
 *
 * The float version stays for accounting, whose columns are still `Float`.
 * FD-0.3 owns that migration; when it lands this becomes the only one.
 */
export function centsFromDecimalAmount(value: Prisma.Decimal, field: string): Cents {
  if (!value.isFinite()) {
    throw new FiscalSigningError(`${field} must be a finite amount, received ${value.toString()}`);
  }
  const minor = value.mul(100);
  if (!minor.isInteger()) {
    throw new FiscalSigningError(
      `${field} (${value.toFixed()}) is finer than one cent and cannot be signed`,
    );
  }
  return centsFromMinorUnits(minor.toNumber());
}

export function centsFromAccountingAmount(value: number, field: string): Cents {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FiscalSigningError(`${field} must be a finite amount, received ${String(value)}`);
  }
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > CENT_EPSILON) {
    throw new FiscalSigningError(
      `${field} (${value}) is finer than one cent and cannot be signed`,
    );
  }
  return centsFromMinorUnits(rounded);
}

/**
 * The receipt block FDGA is sent, built from what was actually signed.
 *
 * Amounts are decimal strings of minor units: `JSON.stringify` throws on a
 * bigint, and a number would put an exact total back through a double on the
 * way out — the one place it must not go.
 *
 * The exact field names here are the part of v7.2 this repo cannot verify
 * without the sandbox. They are a faithful rendering of the specified shape,
 * they are what the signature covers, and if ZIMRA rejects the envelope while
 * the signature verifies, this function is the only thing to change.
 */
function buildNativeReceiptWire(input: {
  deviceId: string;
  receipt: Pick<
    FiscalReceipt,
    | "receiptType"
    | "receiptCurrency"
    | "receiptCounter"
    | "receiptGlobalNo"
    | "previousReceiptHash"
    | "receiptHash"
    | "signature"
  >;
  fiscal: FiscalSigningInput;
}) {
  return {
    deviceID: input.deviceId,
    receiptType: input.receipt.receiptType,
    receiptCurrency: input.receipt.receiptCurrency,
    receiptCounter: input.receipt.receiptCounter,
    receiptGlobalNo: input.receipt.receiptGlobalNo,
    receiptDate:
      input.fiscal.receiptDate instanceof Date
        ? input.fiscal.receiptDate.toISOString()
        : input.fiscal.receiptDate,
    receiptTotalCents: input.fiscal.receiptTotal.toString(),
    receiptTaxes: input.fiscal.taxes.map((line) => ({
      taxID: line.taxId,
      taxPercent: line.taxPercent ?? null,
      taxAmountCents: line.taxAmount.toString(),
    })),
    previousReceiptHash: input.receipt.previousReceiptHash,
    receiptDeviceSignature: {
      hash: input.receipt.receiptHash,
      signature: input.receipt.signature,
    },
  };
}

/** The canonical input a stored row plus its (re-supplied) signable facts
 *  describe. Used to sign, and to re-derive on a retry. */
function canonicalInputFor(args: {
  deviceId: string;
  receiptGlobalNo: number;
  previousReceiptHash: string | null;
  fiscal: FiscalSigningInput;
}): ReceiptCanonicalInput {
  return {
    deviceId: args.deviceId,
    receiptType: args.fiscal.receiptType,
    receiptCurrency: args.fiscal.receiptCurrency,
    receiptGlobalNo: args.receiptGlobalNo,
    receiptDate: args.fiscal.receiptDate,
    receiptTotal: args.fiscal.receiptTotal,
    taxes: args.fiscal.taxes,
    previousReceiptHash: args.previousReceiptHash,
  };
}

/**
 * True once this row holds everything a resubmission needs. A row in this state
 * has already consumed its number and its place in the chain.
 *
 * Deliberately a plain boolean and not a type predicate: "not signed" says
 * nothing about whether the row exists, and a predicate would narrow the
 * unsigned case to `null` and hide the update path for a row that simply has no
 * counters yet (a pre-native row being retried).
 */
function isSigned(receipt: FiscalReceipt | null): boolean {
  return Boolean(
    receipt &&
      receipt.receiptHash &&
      receipt.signature &&
      receipt.receiptGlobalNo !== null &&
      receipt.receiptCounter !== null &&
      receipt.fiscalDayId,
  );
}

/** The fields every attempt writes before the connector is called, whichever
 *  path it takes. */
type PendingReceiptFields = {
  status: "PENDING";
  providerKey: string;
  requestIdempotencyKey: string;
  rawResponseJson: string;
  lastSyncedAt: Date;
};

function refusal(code: FiscalIssueErrorCode, error: string): FiscalIssueResult {
  return { status: "FAILED", errorCode: code, error };
}

/**
 * Issue one document to FDMS and record what came back.
 *
 * This is the whole of the transport-facing work, and it is deliberately
 * ignorant of what kind of document it is issuing: it finds the tenant's active
 * provider, refuses to re-issue something already accepted, writes a PENDING
 * row *before* the call, makes the call, and records the outcome. The payload
 * is built by the caller, because only the caller knows what the document is.
 *
 * **Two paths, chosen by the caller and by the device's state.**
 *
 *   * *Native (FD-3).* The caller supplies {@link FiscalSigningInput}. The
 *     document then gets its counters from the open fiscal day, is hashed,
 *     signed and chained onto the previous receipt's hash, and all of that is
 *     persisted before the network is touched. If no fiscal day is open this is
 *     a **refusal**, not a downgrade: under FDGA a receipt outside a fiscal day
 *     does not exist, and sending one unsigned would produce a document ZIMRA
 *     rejects while the customer holds a slip that says it is fiscalised.
 *   * *Legacy skeleton.* No signing input, and no fiscal day open on the
 *     device: the document is posted exactly as it was before FD-3. This is the
 *     schools path (`lib/schools/fiscalisation.ts`), which is the only live
 *     consumer that has not migrated — the roadmap's standing instruction is
 *     that a school taking money keeps working through every iteration, and its
 *     migration is a schools-roadmap story. A school with a *registered device
 *     and an open day* is a different matter: it is fiscally live, so an
 *     unsigned submission is refused rather than quietly sent.
 *
 * **Synchronous, and durable either way.** The HTTP call blocks the request that
 * triggered it, exactly as the sales-invoice path has always done. What makes
 * that survivable is the order: the row exists in PENDING — with its counters,
 * hash and signature already committed — before the connector is touched, so a
 * timeout, a crash or a 500 leaves a durable record with an `attemptCount` and a
 * `nextRetryAt` for the replay endpoint to find. Nothing about the source
 * document is written here, so a fiscal failure can never undo the invoice or
 * the receipt that caused it.
 */
export async function issueFiscalDocument(input: {
  companyId: string;
  source: FiscalDocumentSource;
  /** Written to `receiptNumber` — the school's own receipt no. Optional. */
  documentNumber?: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  /** Engages the native protocol for this document. See above. */
  fiscal?: FiscalSigningInput;
  /**
   * Run once the attempt is committed to, before the connector is called, and
   * only when there is going to be an attempt. The sales-invoice path uses it
   * to stamp `SalesInvoice.fiscalStatus = PENDING`; doing that unconditionally
   * would flip an already-accepted invoice back to PENDING and never correct
   * it, because an accepted document returns early and is never re-sent.
   */
  onAttempt?: () => Promise<void>;
}): Promise<FiscalIssueResult> {
  const { companyId, source, idempotencyKey, payload } = input;

  const provider = await prisma.fiscalisationProviderConfig.findFirst({
    where: { companyId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!provider) {
    return { status: "FAILED", error: "Missing fiscalisation provider configuration" };
  }

  const existing = await prisma.fiscalReceipt.findUnique({
    where: sourceWhere(source),
  });
  if (existing && existing.companyId !== companyId) {
    return { status: "FAILED", error: "Fiscal receipt belongs to another company" };
  }
  if (existing?.status === "SUCCESS") {
    return {
      status: "SUCCESS",
      receiptId: existing.id,
      providerKey: existing.providerKey ?? provider.providerKey,
      fiscalNumber: existing.fiscalNumber ?? null,
      providerReference: existing.providerReference ?? null,
    };
  }

  const pending: PendingReceiptFields = {
    status: "PENDING",
    providerKey: provider.providerKey,
    requestIdempotencyKey: idempotencyKey,
    rawResponseJson: JSON.stringify({
      status: "PENDING",
      providerKey: provider.providerKey,
      request: payload,
    }),
    lastSyncedAt: new Date(),
  };

  // A row that is already signed keeps its numbers and its bytes: a retry is a
  // retransmission of the same signed receipt, never a new one. Reserving a
  // second number for it would leave the first as a gap in the chain, which
  // reads to ZIMRA as a receipt we hid.
  const alreadySigned = isSigned(existing);
  const openDay = alreadySigned
    ? null
    : await getOpenFiscalDay({ companyId, providerConfigId: provider.id });

  if (!alreadySigned) {
    if (input.fiscal && !openDay) {
      return refusal(
        "FISCAL_DAY_NOT_OPEN",
        new FiscalDayNotOpenError({}).message,
      );
    }
    if (openDay && !input.fiscal) {
      // The device is live. Sending an unsigned document now would burn an
      // idempotency key on something FDGA cannot accept, and would put a
      // receipt outside the chain the day is counting.
      return refusal(
        "FISCAL_SIGNING_INPUT_REQUIRED",
        `Fiscal day ${openDay.fiscalDayNo} is open on this device: this document must be signed, but no signing input was supplied`,
      );
    }
  }

  let receipt: FiscalReceipt;
  let native = false;

  if (alreadySigned && existing) {
    native = true;
    if (input.fiscal) {
      // The document may have been edited between the failed attempt and this
      // one. Re-deriving the hash from its current values and comparing it with
      // what was signed is the cheapest possible proof that we are resending
      // the same receipt and not a different one wearing its number.
      const day = await prisma.fiscalDay.findUnique({
        where: { id: existing.fiscalDayId! },
        select: { deviceId: true },
      });
      const deviceId = day?.deviceId ?? provider.deviceId ?? "";
      let recomputed: string;
      try {
        recomputed = hashReceiptInput(
          canonicalInputFor({
            deviceId,
            receiptGlobalNo: existing.receiptGlobalNo!,
            previousReceiptHash: existing.previousReceiptHash,
            fiscal: input.fiscal,
          }),
        );
      } catch (error) {
        return refusal(
          "FISCAL_SIGNING_REFUSED",
          error instanceof Error ? error.message : "Receipt could not be re-derived",
        );
      }
      if (recomputed !== existing.receiptHash) {
        return refusal(
          "FISCAL_RECEIPT_ALTERED",
          `Receipt ${existing.receiptNumber ?? existing.id} changed after it was signed as global no ${existing.receiptGlobalNo}; it cannot be resubmitted under the same signature`,
        );
      }
    }
    receipt = await prisma.fiscalReceipt.update({
      where: { id: existing.id },
      data: { ...pending, attemptCount: { increment: 1 }, nextRetryAt: null, lastError: null },
    });
  } else if (openDay && input.fiscal) {
    native = true;
    const signingKey = resolveDeviceSigningKey(provider);
    if (!signingKey) {
      // Checked before a number is reserved. Reserving first and failing here
      // would consume a global number for a receipt that was never signed —
      // a permanent gap for a recoverable configuration mistake.
      return refusal(
        "FISCAL_DEVICE_KEY_MISSING",
        `Fiscalisation provider ${provider.providerKey} has no device private key; register the device before issuing fiscal documents`,
      );
    }

    try {
      receipt = await signAndPersist({
        provider,
        day: openDay,
        source,
        documentNumber: input.documentNumber ?? null,
        companyId,
        existing,
        pending,
        fiscal: input.fiscal,
        signingKey,
      });
    } catch (error) {
      // Everything in the transaction rolls back together, counter reservation
      // included, so a refusal here leaves the day exactly where it was.
      if (error instanceof FiscalSigningError) {
        return refusal("FISCAL_SIGNING_REFUSED", error.message);
      }
      if (error instanceof FiscalDayError) {
        return refusal(
          error.code === "FISCAL_DAY_NOT_OPEN" ? "FISCAL_DAY_NOT_OPEN" : "FISCAL_CHAIN_OUT_OF_ORDER",
          error.message,
        );
      }
      if (error instanceof FiscalMappingError) {
        return refusal(error.code, error.message);
      }
      throw error;
    }
  } else {
    receipt = existing
      ? await prisma.fiscalReceipt.update({
          where: { id: existing.id },
          data: {
            ...pending,
            attemptCount: { increment: 1 },
            nextRetryAt: null,
            lastError: null,
          },
        })
      : await prisma.fiscalReceipt.create({
          data: {
            companyId,
            ...sourceData(source),
            ...(input.documentNumber ? { receiptNumber: input.documentNumber } : {}),
            ...pending,
            attemptCount: 1,
          },
        });
  }

  if (input.onAttempt) await input.onAttempt();

  try {
    const nativeWire =
      native && input.fiscal
        ? buildNativeReceiptWire({
            deviceId: provider.deviceId ?? "",
            receipt,
            fiscal: input.fiscal,
          })
        : null;

    const connectorResult = await issueWithFdmsConnector({
      provider,
      payload: {
        idempotencyKey,
        payload: nativeWire ? { ...payload, receipt: nativeWire } : payload,
      },
      attemptCount: receipt.attemptCount,
      // The legacy path keeps its configured `/receipts` endpoint and its body
      // `deviceId` exactly as they were; only a signed submission goes to FDGA's
      // device-addressed SubmitReceipt.
      ...(nativeWire
        ? { path: submitReceiptPath(provider), omitDeviceIdInBody: true }
        : {}),
    });

    const updated = await markFiscalReceiptResult({
      receiptId: receipt.id,
      status: connectorResult.status,
      fiscalNumber: connectorResult.fiscalNumber,
      providerReference: connectorResult.providerReference,
      qrCodeData: connectorResult.qrCodeData,
      signature: connectorResult.signature,
      rawResponseJson: connectorResult.rawResponseJson,
      error: connectorResult.error,
      nextRetryAt: connectorResult.nextRetryAt,
    });

    return {
      status: updated.status === "VOIDED" ? "FAILED" : updated.status,
      receiptId: updated.id,
      providerKey: updated.providerKey,
      fiscalNumber: updated.fiscalNumber,
      providerReference: updated.providerReference,
      error: updated.lastError ?? undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown FDMS connector error";
    const updated = await markFiscalReceiptResult({
      receiptId: receipt.id,
      status: "FAILED",
      rawResponseJson: JSON.stringify({ error: message }),
      error: message,
      nextRetryAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    return {
      status: "FAILED",
      receiptId: updated.id,
      providerKey: updated.providerKey,
      error: message,
    };
  }
}

/**
 * Reserve, sign, chain and persist — in one transaction, before any network.
 *
 * The order inside is the whole point. The counters are taken by a single
 * locked `UPDATE ... RETURNING` (see `lib/accounting/fiscal-day.ts`), the
 * canonical string is built from those exact numbers and the previous receipt's
 * hash, the signature is made, and only then is the PENDING row written. If any
 * step throws, the transaction rolls back and the numbers are handed back
 * instead of becoming a gap; if the process dies after it commits, a durable
 * PENDING row exists carrying its place in the chain, and replay resends the
 * same signed bytes rather than signing new ones.
 *
 * The transaction also holds the fiscal day's row lock from the reservation to
 * the commit, which serialises concurrent issuers on one device. That is not
 * incidental: each receipt has to know the hash of the one before it, so they
 * genuinely cannot be signed in parallel.
 */
async function signAndPersist(args: {
  provider: FiscalisationProviderConfig;
  day: FiscalDay;
  source: FiscalDocumentSource;
  documentNumber: string | null;
  companyId: string;
  existing: FiscalReceipt | null;
  pending: PendingReceiptFields;
  fiscal: FiscalSigningInput;
  signingKey: { privateKeyPem: string; passphrase?: string };
}): Promise<FiscalReceipt> {
  const { provider, day, fiscal } = args;

  return prisma.$transaction(async (tx) => {
    const reserved = await reserveNextReceiptNumbers(day.id, tx);

    const canonical = canonicalInputFor({
      deviceId: reserved.deviceId,
      receiptGlobalNo: reserved.receiptGlobalNo,
      previousReceiptHash: reserved.previousReceiptHash,
      fiscal,
    });
    const receiptHash = hashReceiptInput(canonical);
    const signature = signReceipt(
      receiptHash,
      args.signingKey.privateKeyPem,
      args.signingKey.passphrase ? { passphrase: args.signingKey.passphrase } : undefined,
    );
    // Built here rather than on print: the QR is a function of the signature,
    // so the only moment it can be derived is the moment the receipt is signed.
    const qrCodeData = buildVerificationQrUrl({
      portalBase: qrPortalBase(provider),
      deviceId: reserved.deviceId,
      receiptDate: fiscal.receiptDate,
      receiptGlobalNo: reserved.receiptGlobalNo,
      signature,
    });

    const chainFields = {
      fiscalDayId: day.id,
      receiptCounter: reserved.receiptCounter,
      receiptGlobalNo: reserved.receiptGlobalNo,
      previousReceiptHash: reserved.previousReceiptHash,
      receiptHash,
      receiptType: fiscal.receiptType,
      receiptCurrency: fiscal.receiptCurrency.toUpperCase(),
      signature,
      qrCodeData,
    };

    const row = args.existing
      ? await tx.fiscalReceipt.update({
          where: { id: args.existing.id },
          data: {
            ...args.pending,
            ...chainFields,
            attemptCount: { increment: 1 },
            nextRetryAt: null,
            lastError: null,
          },
        })
      : await tx.fiscalReceipt.create({
          data: {
            companyId: args.companyId,
            ...sourceData(args.source),
            ...(args.documentNumber ? { receiptNumber: args.documentNumber } : {}),
            ...args.pending,
            ...chainFields,
            attemptCount: 1,
          },
        });

    // Advance the day's chain head to this receipt. Guarded on the counter we
    // just reserved, so it can only apply in issue order; a false here means
    // something wrote out of order and the next receipt would chain onto the
    // wrong hash, which is a stop-the-line defect rather than a retry.
    const advanced = await recordReceiptHash(
      { dayId: day.id, receiptCounter: reserved.receiptCounter, receiptHash },
      tx,
    );
    if (!advanced) {
      throw new FiscalDayError(
        "FISCAL_CHAIN_OUT_OF_ORDER",
        `Fiscal day ${day.fiscalDayNo} moved while receipt ${reserved.receiptGlobalNo} was being signed; the chain head was not advanced`,
      );
    }

    return row;
  });
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export async function validateFiscalInvoice(companyId: string, invoiceId: string): Promise<FiscalValidationResult> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      lines: true,
    },
  });

  if (!invoice || invoice.companyId !== companyId) {
    return { ok: false, missing: ["invoice"] };
  }

  const settings = await prisma.accountingSettings.findUnique({
    where: { companyId },
  });

  const missing: string[] = [];
  if (!settings) {
    missing.push("accounting settings");
  } else {
    if (!normalize(settings.legalName)) missing.push("supplier legal name");
    if (!normalize(settings.vatNumber)) missing.push("supplier VAT number");
    if (!normalize(settings.taxNumber)) missing.push("supplier tax number");
    if (!normalize(settings.address)) missing.push("supplier address");
  }

  if (!normalize(invoice.invoiceNumber)) missing.push("invoice number");
  if (!invoice.invoiceDate) missing.push("invoice date");
  if (!normalize(invoice.currency)) missing.push("currency");

  if (!normalize(invoice.customer?.name)) missing.push("customer name");
  if (!normalize(invoice.customer?.address)) missing.push("customer address");

  if (!invoice.lines || invoice.lines.length === 0) {
    missing.push("invoice line items");
  }

  const invalidLines = (invoice.lines ?? []).filter(
    (line) =>
      !normalize(line.description) ||
      line.quantity <= 0 ||
      !Number.isFinite(line.unitPrice) ||
      line.unitPrice < 0,
  );
  if (invalidLines.length > 0) missing.push("valid line descriptions and quantities");

  return { ok: missing.length === 0, missing };
}

export async function markFiscalReceiptResult(input: {
  receiptId: string;
  status: "SUCCESS" | "FAILED" | "VOIDED" | "PENDING";
  fiscalNumber?: string | null;
  providerReference?: string | null;
  qrCodeData?: string | null;
  signature?: string | null;
  rawResponseJson?: string | null;
  error?: string | null;
  nextRetryAt?: Date | null;
}) {
  const updated = await prisma.fiscalReceipt.update({
    where: { id: input.receiptId },
    data: {
      status: input.status,
      fiscalNumber: input.fiscalNumber ?? undefined,
      // `?? undefined` throughout: a provider that returns nothing must never
      // erase what the device already computed. For a native receipt the QR and
      // the signature are OURS — derived from the signed canonical string — and
      // a null in the response is silence, not a correction.
      qrCodeData: input.qrCodeData ?? undefined,
      signature: input.signature ?? undefined,
      rawResponseJson: input.rawResponseJson ?? undefined,
      lastError: input.error ?? undefined,
      providerReference: input.providerReference ?? input.fiscalNumber ?? undefined,
      nextRetryAt: input.nextRetryAt ?? undefined,
      lastSyncedAt: new Date(),
      issuedAt: input.status === "SUCCESS" ? new Date() : undefined,
    },
  });

  if (updated.invoiceId) {
    await prisma.salesInvoice.update({
      where: { id: updated.invoiceId },
      data: {
        fiscalStatus: updated.status,
      },
    });
  }

  return updated;
}

type InvoiceLineForSigning = {
  description: string;
  taxAmount: number;
  taxCode: { code: string; rate: number; zimraTaxId: number | null } | null;
};

/**
 * The signable facts of a sales invoice.
 *
 * Tax lines are aggregated by `TaxCode.zimraTaxId` (FD-0.2), because that is
 * the key ZIMRA verifies against and the key the fiscal day's counters are
 * summed by. A line whose tax code is missing or unmapped is refused by name
 * rather than defaulted to a rate: guessing here would sign an invoice claiming
 * a VAT treatment the tenant never chose, and the fix — mapping the code once
 * in tax setup — is a minute's work for whoever is told.
 */
export function buildInvoiceSigningInput(invoice: {
  currency: string;
  invoiceDate: Date;
  total: number;
  lines: InvoiceLineForSigning[];
}): FiscalSigningInput {
  const unmapped = invoice.lines.filter(
    (line) => !line.taxCode || line.taxCode.zimraTaxId === null,
  );
  if (unmapped.length > 0) {
    const names = [
      ...new Set(unmapped.map((line) => line.taxCode?.code ?? line.description)),
    ];
    throw new FiscalMappingError(
      "FISCAL_TAX_CODE_UNMAPPED",
      `No ZIMRA taxID mapped for ${names.join(", ")}: set it in tax setup before fiscalising`,
    );
  }

  const byTaxId = new Map<number, { rate: number; cents: bigint }>();
  for (const line of invoice.lines) {
    const taxCode = line.taxCode!;
    const taxId = taxCode.zimraTaxId!;
    const cents = centsFromAccountingAmount(line.taxAmount, `tax amount for ${taxCode.code}`);
    const bucket = byTaxId.get(taxId);
    if (!bucket) {
      byTaxId.set(taxId, { rate: taxCode.rate, cents });
      continue;
    }
    // Two of the tenant's codes pointing at one ZIMRA taxID is legitimate
    // (FD-0.2 allows it), but only if they agree on the rate — the canonical
    // string carries one percent per taxID, so two rates under one ID cannot
    // both be signed.
    if (bucket.rate !== taxCode.rate) {
      throw new FiscalMappingError(
        "FISCAL_TAX_CODE_UNMAPPED",
        `Tax codes with different rates (${bucket.rate}%, ${taxCode.rate}%) both map to ZIMRA taxID ${taxId}`,
      );
    }
    bucket.cents += cents;
  }

  const taxes: ReceiptTaxLine[] = [...byTaxId.entries()].map(([taxId, bucket]) => ({
    taxId,
    // An exempt or zero-rated line carries no percent in the canonical string.
    taxPercent: bucket.rate > 0 ? bucket.rate : null,
    taxAmount: centsFromMinorUnits(bucket.cents),
  }));

  return {
    receiptType: "FISCALINVOICE",
    receiptCurrency: invoice.currency,
    // The invoice's own date, not "now": it is what is printed, and signing a
    // different date than the customer holds is what makes a portal lookup fail.
    receiptDate: invoice.invoiceDate,
    receiptTotal: centsFromAccountingAmount(invoice.total, "invoice total"),
    taxes,
  };
}

export async function issueFiscalReceipt(
  companyId: string,
  invoiceId: string,
  actorId: string,
): Promise<FiscalIssueResult> {
  void actorId;
  const idempotencyKey = `${companyId}:${invoiceId}`;
  const validation = await validateFiscalInvoice(companyId, invoiceId);
  if (!validation.ok) {
    return { status: "FAILED", error: `Missing fiscal fields: ${validation.missing.join(", ")}` };
  }

  const [invoice, supplier] = await Promise.all([
    prisma.salesInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        lines: {
          include: {
            // FD-0.2: the ZIMRA taxID lives on the code, and the signature is
            // built from it rather than from the line's copied-down rate.
            taxCode: { select: { code: true, rate: true, zimraTaxId: true } },
          },
        },
      },
    }),
    prisma.accountingSettings.findUnique({
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
    }),
  ]);

  if (!invoice) {
    return { status: "FAILED", error: "Invoice not found" };
  }

  const payload = {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    currency: invoice.currency,
    totals: {
      subTotal: invoice.subTotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
    },
    supplier,
    customer: {
      name: invoice.customer?.name ?? null,
      taxNumber: invoice.customer?.taxNumber ?? null,
      vatNumber: invoice.customer?.vatNumber ?? null,
      address: invoice.customer?.address ?? null,
      phone: invoice.customer?.phone ?? null,
      email: invoice.customer?.email ?? null,
    },
    items: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
    })),
  };

  // Mapped before anything is written, so an unmapped tax code costs nothing
  // but an error message.
  let fiscal: FiscalSigningInput;
  try {
    fiscal = buildInvoiceSigningInput(invoice);
  } catch (error) {
    if (error instanceof FiscalMappingError) {
      return { status: "FAILED" as const, errorCode: error.code, error: error.message };
    }
    if (error instanceof FiscalSigningError) {
      return {
        status: "FAILED" as const,
        errorCode: "FISCAL_SIGNING_REFUSED" as const,
        error: error.message,
      };
    }
    throw error;
  }

  return issueFiscalDocument({
    companyId,
    source: { kind: "SALES_INVOICE", invoiceId },
    idempotencyKey,
    payload,
    fiscal,
    // Stamped before the call and corrected by `markFiscalReceiptResult`
    // afterwards, so a crash mid-flight leaves the invoice saying "in
    // progress" rather than "done".
    onAttempt: async () => {
      await prisma.salesInvoice.update({
        where: { id: invoiceId },
        data: { fiscalStatus: "PENDING" },
      });
    },
  });
}

export async function syncFiscalReceiptStatus(companyId: string, receiptId: string) {
  const receipt = await prisma.fiscalReceipt.findUnique({
    where: { id: receiptId },
  });
  if (!receipt || receipt.companyId !== companyId) {
    throw new Error("Fiscal receipt not found");
  }

  const provider = await prisma.fiscalisationProviderConfig.findFirst({
    where: {
      companyId,
      isActive: true,
      ...(receipt.providerKey ? { providerKey: receipt.providerKey } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!provider) {
    throw new Error("Active fiscalisation provider configuration not found");
  }

  const reference = receipt.providerReference ?? receipt.fiscalNumber ?? receipt.receiptNumber;
  if (!reference) {
    throw new Error("Receipt has no provider reference for sync");
  }

  const syncResult = await syncWithFdmsConnector({
    provider,
    providerReference: reference,
    attemptCount: receipt.attemptCount,
  });

  return markFiscalReceiptResult({
    receiptId,
    status: syncResult.status,
    fiscalNumber: syncResult.fiscalNumber,
    providerReference: syncResult.providerReference,
    qrCodeData: syncResult.qrCodeData,
    signature: syncResult.signature,
    rawResponseJson: syncResult.rawResponseJson,
    error: syncResult.error,
    nextRetryAt: syncResult.nextRetryAt,
  });
}
