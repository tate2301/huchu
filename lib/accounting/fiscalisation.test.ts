/**
 * FD-3 wiring / FD-0.4 — the issue path, against a real Postgres and a mocked
 * transport.
 *
 * The database is real because everything this file is trying to prove is
 * enforced by it: the one-source CHECK across four columns, the fiscal day's
 * counter reservation, the uniqueness of a global number per device. The
 * *transport* is mocked, and only the transport — `issueWithFdmsConnector` is
 * replaced, while the real `resolveDeviceSigningKey` and `submitReceiptPath`
 * still run, so the path FDGA is called at and the key the receipt is signed
 * with are the production ones. No network is opened, and the device keypair is
 * generated in `beforeAll`, so nothing here needs ZIMRA.
 *
 * What is deliberately NOT asserted: that ZIMRA accepts any of this. The
 * canonical string, the signature and the QR are pinned against
 * `lib/accounting/fdms-receipt-signing` (which has its own golden tests); the
 * submission envelope cannot be verified without the sandbox, and no test here
 * pretends otherwise.
 *
 * Run: npx vitest run lib/accounting/fiscalisation
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const { issueMock, syncMock } = vi.hoisted(() => ({
  issueMock: vi.fn(),
  syncMock: vi.fn(),
}));

vi.mock("@/lib/accounting/fdms-connector", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/accounting/fdms-connector")>();
  return { ...actual, issueWithFdmsConnector: issueMock, syncWithFdmsConnector: syncMock };
});

import type { FiscalSigningInput } from "@/lib/accounting/fiscalisation";

const {
  buildInvoiceSigningInput,
  centsFromAccountingAmount,
  issueFiscalDocument,
  issueFiscalReceipt,
  sourceWhere,
} = await import("@/lib/accounting/fiscalisation");
const { openFiscalDay, closeFiscalDay } = await import("@/lib/accounting/fiscal-day");
const {
  centsFromMinorUnits,
  verifyReceiptChain,
  verifyReceiptSignature,
} = await import("@/lib/accounting/fdms-receipt-signing");

const suite = crypto.randomUUID().slice(0, 8);
const KEY_ENV = `FDMS_TEST_BUNDLE_${suite.toUpperCase()}`;

let companyId: string;
let providerConfigId: string;
let customerId: string;
let publicKeyPem: string;
let seq = 0;

/** ISO date used by every document here: 11:00 CAT, so the UTC instant and the
 *  Harare calendar date agree and the QR assertion is not a timezone trap. */
const DOC_DATE = new Date("2026-05-15T09:00:00.000Z");

function connectorSuccess(fiscalNumber = "FDMS-0001") {
  return {
    status: "SUCCESS" as const,
    fiscalNumber,
    providerReference: "REF-1",
    qrCodeData: null,
    signature: null,
    rawResponseJson: JSON.stringify({ status: "SUCCESS", fiscalNumber }),
    error: null,
    nextRetryAt: null,
  };
}

/** The signable facts of a $115.00 invoice carrying $15.00 of 15% VAT. */
function signingInput(overrides?: Partial<FiscalSigningInput>): FiscalSigningInput {
  return {
    receiptType: "FISCALINVOICE",
    receiptCurrency: "USD",
    receiptDate: DOC_DATE,
    receiptTotal: centsFromMinorUnits(11500),
    taxes: [{ taxId: 1, taxPercent: 15, taxAmount: centsFromMinorUnits(1500) }],
    ...overrides,
  };
}

async function makeInvoice(input?: { total?: number; taxTotal?: number }) {
  seq += 1;
  return prisma.salesInvoice.create({
    data: {
      companyId,
      customerId,
      invoiceNumber: `FD3-${suite}-${seq}`,
      invoiceDate: DOC_DATE,
      currency: "USD",
      subTotal: (input?.total ?? 115) - (input?.taxTotal ?? 15),
      taxTotal: input?.taxTotal ?? 15,
      total: input?.total ?? 115,
    },
    select: { id: true },
  });
}

async function openDay() {
  return openFiscalDay({ companyId, providerConfigId });
}

beforeAll(async () => {
  await prisma.$connect();

  const keypair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  publicKeyPem = keypair.publicKey;
  // Through the `env:` indirection on purpose: the signing key must be reachable
  // the same way the mTLS key is, or a deployment that keeps its secrets out of
  // the database would sign nothing.
  process.env[KEY_ENV] = JSON.stringify({ key: keypair.privateKey });

  const company = await prisma.company.create({
    data: { name: "FD-3 Issue Path Test Co", slug: `fd3-${suite}` },
    select: { id: true },
  });
  companyId = company.id;

  const provider = await prisma.fiscalisationProviderConfig.create({
    data: {
      companyId,
      providerKey: `zimra-${suite}`,
      apiBaseUrl: "https://fdms.invalid",
      deviceId: "10001",
      certificateRef: `env:${KEY_ENV}`,
      isActive: true,
    },
    select: { id: true },
  });
  providerConfigId = provider.id;

  const customer = await prisma.customer.create({
    data: { companyId, name: "Chikomo Traders", address: "1 Robert Mugabe Rd, Harare" },
    select: { id: true },
  });
  customerId = customer.id;

  await prisma.accountingSettings.upsert({
    where: { companyId },
    update: {},
    create: {
      companyId,
      baseCurrency: "USD",
      legalName: "Huchu Test Ltd",
      vatNumber: "220123456",
      taxNumber: "1000123456",
      address: "1 Samora Machel Ave, Harare",
    },
  });
});

afterAll(async () => {
  delete process.env[KEY_ENV];
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  issueMock.mockReset();
  issueMock.mockResolvedValue(connectorSuccess());
  syncMock.mockReset();
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.fiscalDay.deleteMany({ where: { companyId } });
});

describe("FiscalDocumentSource — four arms, one column each", () => {
  it("round-trips every source through sourceWhere", () => {
    expect(sourceWhere({ kind: "SALES_INVOICE", invoiceId: "i1" })).toEqual({ invoiceId: "i1" });
    expect(sourceWhere({ kind: "SCHOOL_FEE_RECEIPT", schoolReceiptId: "s1" })).toEqual({
      schoolReceiptId: "s1",
    });
    expect(sourceWhere({ kind: "CREDIT_NOTE", creditNoteId: "c1" })).toEqual({ creditNoteId: "c1" });
    expect(sourceWhere({ kind: "RETAIL_SALE", retailSaleId: "r1" })).toEqual({ retailSaleId: "r1" });
  });

  it("writes a credit note to creditNoteId and nothing else", async () => {
    await openDay();
    const invoice = await makeInvoice();
    seq += 1;
    const note = await prisma.creditNote.create({
      data: {
        companyId,
        invoiceId: invoice.id,
        noteNumber: `CN-${suite}-${seq}`,
        noteDate: DOC_DATE,
        currency: "USD",
        total: 115,
        taxTotal: 15,
      },
      select: { id: true },
    });

    const result = await issueFiscalDocument({
      companyId,
      source: { kind: "CREDIT_NOTE", creditNoteId: note.id },
      idempotencyKey: `${companyId}:credit-note:${note.id}`,
      payload: { noteNumber: `CN-${suite}-${seq}` },
      // A credit note is signed with a negative total — v7.2 counts it as a
      // reduction of the day, not a sale of its own.
      fiscal: signingInput({
        receiptType: "CREDITNOTE",
        receiptTotal: centsFromMinorUnits(-11500),
        taxes: [{ taxId: 1, taxPercent: 15, taxAmount: centsFromMinorUnits(-1500) }],
      }),
    });

    expect(result.status).toBe("SUCCESS");
    const row = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { creditNoteId: note.id },
    });
    expect(row.invoiceId).toBeNull();
    expect(row.schoolReceiptId).toBeNull();
    expect(row.retailSaleId).toBeNull();
    expect(row.receiptType).toBe("CREDITNOTE");
    expect(row.receiptGlobalNo).toBe(1);
  });

  it("writes a POS sale to retailSaleId and nothing else", async () => {
    await openDay();
    seq += 1;
    const sale = await prisma.retailSale.create({
      data: {
        companyId,
        saleNo: `POS-${suite}-${seq}`,
        siteId: `site-${suite}`,
        currency: "USD",
        totalAmount: 115,
      },
      select: { id: true },
    });

    const result = await issueFiscalDocument({
      companyId,
      source: { kind: "RETAIL_SALE", retailSaleId: sale.id },
      idempotencyKey: `${companyId}:retail-sale:${sale.id}`,
      payload: { saleNo: `POS-${suite}-${seq}` },
      fiscal: signingInput(),
    });

    expect(result.status).toBe("SUCCESS");
    const row = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { retailSaleId: sale.id },
    });
    expect(row.invoiceId).toBeNull();
    expect(row.creditNoteId).toBeNull();
    expect(row.receiptGlobalNo).toBe(1);
  });
});

describe("no fiscal day is open", () => {
  it("refuses a signed document by name, without writing or sending anything", async () => {
    const invoice = await makeInvoice();

    const result = await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
      fiscal: signingInput(),
    });

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("FISCAL_DAY_NOT_OPEN");
    expect(result.error).toMatch(/No fiscal day is open/i);
    // Nothing was sent and no number was consumed: this is recoverable by a
    // supervisor opening the day, and it must leave no trace that would make
    // the chain look gapped afterwards.
    expect(issueMock).not.toHaveBeenCalled();
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);
  });

  it("still issues an UNSIGNED document the pre-native way (the schools path)", async () => {
    // `lib/schools/fiscalisation.ts` supplies no signing input, and a school
    // with no registered device has no fiscal day. That combination is the one
    // legacy path left, and it must keep working exactly as it did — a school
    // taking fees does not stop because FD-3 landed.
    const invoice = await makeInvoice();

    const result = await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: { invoiceNumber: "legacy" },
    });

    expect(result.status).toBe("SUCCESS");
    expect(issueMock).toHaveBeenCalledTimes(1);
    const call = issueMock.mock.calls[0][0];
    // No path override and no deviceId suppression: the connector keeps its
    // configured `/receipts` endpoint and its body deviceId.
    expect(call.path).toBeUndefined();
    expect(call.omitDeviceIdInBody).toBeUndefined();
    expect(call.payload.payload.receipt).toBeUndefined();

    const row = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(row.status).toBe("SUCCESS");
    expect(row.receiptGlobalNo).toBeNull();
    expect(row.receiptHash).toBeNull();
    expect(row.fiscalDayId).toBeNull();
  });
});

describe("a day is open", () => {
  it("refuses an unsigned document rather than sending one FDGA cannot accept", async () => {
    const day = await openDay();
    const invoice = await makeInvoice();

    const result = await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
    });

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("FISCAL_SIGNING_INPUT_REQUIRED");
    expect(issueMock).not.toHaveBeenCalled();
    const after = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.lastReceiptGlobalNo).toBe(0);
  });

  it("persists the whole chain on the PENDING row before the connector is called", async () => {
    const day = await openDay();
    const invoice = await makeInvoice();

    // Assert the row as it exists at the moment of the call, not afterwards:
    // this is the ordering the whole crash-survivability argument rests on.
    let atCallTime: {
      status: string;
      receiptGlobalNo: number | null;
      receiptHash: string | null;
      signature: string | null;
      fiscalDayId: string | null;
    } | null = null;
    issueMock.mockImplementation(async () => {
      atCallTime = await prisma.fiscalReceipt.findUnique({
        where: { invoiceId: invoice.id },
        select: {
          status: true,
          receiptGlobalNo: true,
          receiptHash: true,
          signature: true,
          fiscalDayId: true,
        },
      });
      return connectorSuccess();
    });

    const result = await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
      fiscal: signingInput(),
    });
    expect(result.status).toBe("SUCCESS");

    expect(atCallTime).not.toBeNull();
    expect(atCallTime!.status).toBe("PENDING");
    expect(atCallTime!.receiptGlobalNo).toBe(1);
    expect(atCallTime!.receiptHash).toBeTruthy();
    expect(atCallTime!.signature).toBeTruthy();
    expect(atCallTime!.fiscalDayId).toBe(day.id);
  });

  it("signs, chains and QRs the receipt, and advances the day's chain head", async () => {
    const day = await openDay();
    const invoice = await makeInvoice();

    await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
      fiscal: signingInput(),
    });

    const row = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(row.receiptCounter).toBe(1);
    expect(row.receiptGlobalNo).toBe(1);
    // The day's first receipt has nothing to chain onto.
    expect(row.previousReceiptHash).toBeNull();
    expect(row.receiptType).toBe("FISCALINVOICE");
    expect(row.receiptCurrency).toBe("USD");
    expect(
      verifyReceiptSignature({
        hash: row.receiptHash!,
        signature: row.signature!,
        publicKeyPem,
      }),
    ).toBe(true);

    // deviceID padded to 10, ddMMyyyy, global no padded to 10, 16 hex of the
    // signature's MD5 — the exact concatenation the portal looks up.
    expect(row.qrCodeData).toMatch(
      /^https:\/\/fdms\.zimra\.co\.zw\/0000010001150520260000000001[0-9A-F]{16}$/,
    );

    const afterDay = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(afterDay.lastReceiptCounter).toBe(1);
    expect(afterDay.lastReceiptGlobalNo).toBe(1);
    expect(afterDay.lastReceiptHash).toBe(row.receiptHash);
  });

  it("sends the signed receipt to SubmitReceipt with the device only in the path", async () => {
    await openDay();
    const invoice = await makeInvoice();

    await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: { invoiceNumber: "INV-1" },
      fiscal: signingInput(),
    });

    const call = issueMock.mock.calls[0][0];
    expect(call.path).toBe("/Device/v1/10001/SubmitReceipt");
    expect(call.omitDeviceIdInBody).toBe(true);

    const wire = call.payload.payload.receipt;
    expect(wire.receiptGlobalNo).toBe(1);
    expect(wire.receiptCounter).toBe(1);
    // Minor units as strings: a JSON number would put an exact total back
    // through a double on the way out.
    expect(wire.receiptTotalCents).toBe("11500");
    expect(wire.receiptTaxes).toEqual([
      { taxID: 1, taxPercent: 15, taxAmountCents: "1500" },
    ]);
    expect(wire.receiptDeviceSignature.hash).toBeTruthy();
    // The caller's own payload still travels alongside it.
    expect(call.payload.payload.invoiceNumber).toBe("INV-1");
  });

  it("chains the second receipt onto the first, gap-free", async () => {
    await openDay();
    const first = await makeInvoice();
    const second = await makeInvoice();

    for (const invoice of [first, second]) {
      await issueFiscalDocument({
        companyId,
        source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
        idempotencyKey: `${companyId}:${invoice.id}`,
        payload: {},
        fiscal: signingInput(),
      });
    }

    const rows = await prisma.fiscalReceipt.findMany({
      where: { companyId },
      orderBy: { receiptGlobalNo: "asc" },
    });
    expect(rows.map((row) => row.receiptGlobalNo)).toEqual([1, 2]);
    expect(rows.map((row) => row.receiptCounter)).toEqual([1, 2]);
    expect(rows[1].previousReceiptHash).toBe(rows[0].receiptHash);

    // And the chain re-derives from what is stored, which is the audit that
    // makes storing it worth anything.
    const verification = verifyReceiptChain(
      rows.map((row) => ({
        input: {
          deviceId: "10001",
          receiptType: "FISCALINVOICE" as const,
          receiptCurrency: "USD",
          receiptGlobalNo: row.receiptGlobalNo!,
          receiptDate: DOC_DATE,
          receiptTotal: centsFromMinorUnits(11500),
          taxes: [{ taxId: 1, taxPercent: 15, taxAmount: centsFromMinorUnits(1500) }],
          previousReceiptHash: row.previousReceiptHash,
        },
        receiptHash: row.receiptHash!,
      })),
    );
    expect(verification.ok).toBe(true);
  });

  it("refuses when the device has no private key, without burning a number", async () => {
    const day = await openDay();
    const invoice = await makeInvoice();
    await prisma.fiscalisationProviderConfig.update({
      where: { id: providerConfigId },
      data: { certificateRef: null },
    });

    try {
      const result = await issueFiscalDocument({
        companyId,
        source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
        idempotencyKey: `${companyId}:${invoice.id}`,
        payload: {},
        fiscal: signingInput(),
      });
      expect(result.status).toBe("FAILED");
      expect(result.errorCode).toBe("FISCAL_DEVICE_KEY_MISSING");
      expect(issueMock).not.toHaveBeenCalled();
      // The key is checked before the counters are taken: a configuration
      // mistake must not leave a permanent gap in the device's numbering.
      const after = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
      expect(after.lastReceiptGlobalNo).toBe(0);
    } finally {
      await prisma.fiscalisationProviderConfig.update({
        where: { id: providerConfigId },
        data: { certificateRef: `env:${KEY_ENV}` },
      });
    }
  });

  it("refuses a signing input finer than a cent instead of rounding it", async () => {
    await openDay();
    const invoice = await makeInvoice();

    const result = await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
      fiscal: signingInput({ receiptCurrency: "usd!" }),
    });

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("FISCAL_SIGNING_REFUSED");
    expect(issueMock).not.toHaveBeenCalled();
    // The transaction rolled back, reservation included.
    const day = await prisma.fiscalDay.findFirstOrThrow({ where: { companyId } });
    expect(day.lastReceiptGlobalNo).toBe(0);
  });
});

describe("a retry resends the same signed receipt", () => {
  async function issueFailing(invoiceId: string) {
    issueMock.mockRejectedValueOnce(new Error("FDMS unreachable"));
    return issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId },
      idempotencyKey: `${companyId}:${invoiceId}`,
      payload: {},
      fiscal: signingInput(),
    });
  }

  it("keeps the numbers, the hash and the signature it already committed", async () => {
    const day = await openDay();
    const invoice = await makeInvoice();

    const failed = await issueFailing(invoice.id);
    expect(failed.status).toBe("FAILED");
    const first = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(first.status).toBe("FAILED");
    expect(first.receiptGlobalNo).toBe(1);
    expect(first.nextRetryAt).toBeInstanceOf(Date);

    const retry = await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
      fiscal: signingInput(),
    });
    expect(retry.status).toBe("SUCCESS");

    const after = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { invoiceId: invoice.id },
    });
    // A retry is a retransmission, not a new receipt: reserving a second number
    // would leave the first as a gap, which reads to ZIMRA as a hidden sale.
    expect(after.receiptGlobalNo).toBe(1);
    expect(after.receiptCounter).toBe(1);
    expect(after.receiptHash).toBe(first.receiptHash);
    expect(after.signature).toBe(first.signature);
    expect(after.qrCodeData).toBe(first.qrCodeData);
    expect(after.attemptCount).toBe(2);

    const afterDay = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(afterDay.lastReceiptGlobalNo).toBe(1);
  });

  it("refuses to resend under the old signature when the document changed", async () => {
    await openDay();
    const invoice = await makeInvoice();
    await issueFailing(invoice.id);
    issueMock.mockClear();

    const retry = await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
      // Somebody edited the invoice between the failure and the retry.
      fiscal: signingInput({ receiptTotal: centsFromMinorUnits(12000) }),
    });

    expect(retry.status).toBe("FAILED");
    expect(retry.errorCode).toBe("FISCAL_RECEIPT_ALTERED");
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("does not re-send a receipt FDMS has already accepted", async () => {
    await openDay();
    const invoice = await makeInvoice();
    await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
      fiscal: signingInput(),
    });
    expect(issueMock).toHaveBeenCalledTimes(1);

    const again = await issueFiscalDocument({
      companyId,
      source: { kind: "SALES_INVOICE", invoiceId: invoice.id },
      idempotencyKey: `${companyId}:${invoice.id}`,
      payload: {},
      fiscal: signingInput(),
    });
    expect(again.status).toBe("SUCCESS");
    expect(issueMock).toHaveBeenCalledTimes(1);
  });
});

describe("issueFiscalReceipt — the sales invoice, end to end", () => {
  let taxCodeId: string;

  beforeAll(async () => {
    const taxCode = await prisma.taxCode.create({
      data: {
        companyId,
        code: `VAT15-${suite}`,
        name: "VAT 15%",
        rate: 15,
        zimraTaxId: 3,
      },
      select: { id: true },
    });
    taxCodeId = taxCode.id;
  });

  async function invoiceWithLines(mapped: boolean) {
    const invoice = await makeInvoice();
    await prisma.salesInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        description: "Consulting",
        quantity: 1,
        unitPrice: 100,
        taxRate: 15,
        taxAmount: 15,
        lineTotal: 115,
        ...(mapped ? { taxCodeId } : {}),
      },
    });
    return invoice.id;
  }

  it("signs the invoice with the taxID mapped on its tax code", async () => {
    await openDay();
    const invoiceId = await invoiceWithLines(true);

    const result = await issueFiscalReceipt(companyId, invoiceId, "tester");
    expect(result.status).toBe("SUCCESS");

    const wire = issueMock.mock.calls[0][0].payload.payload.receipt;
    expect(wire.receiptTaxes).toEqual([
      { taxID: 3, taxPercent: 15, taxAmountCents: "1500" },
    ]);
    expect(wire.receiptTotalCents).toBe("11500");

    const row = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { invoiceId } });
    expect(row.receiptGlobalNo).toBe(1);
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.fiscalStatus).toBe("SUCCESS");
  });

  it("refuses an unmapped tax code by name rather than guessing a rate", async () => {
    await openDay();
    const invoiceId = await invoiceWithLines(false);

    const result = await issueFiscalReceipt(companyId, invoiceId, "tester");
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("FISCAL_TAX_CODE_UNMAPPED");
    expect(result.error).toMatch(/ZIMRA taxID/);
    expect(issueMock).not.toHaveBeenCalled();
    expect(await prisma.fiscalReceipt.count({ where: { invoiceId } })).toBe(0);
  });

  it("refuses once the fiscal day is closed, and says which", async () => {
    const day = await openDay();
    await closeFiscalDay({ dayId: day.id, companyId, closingSignature: "test" });
    const invoiceId = await invoiceWithLines(true);

    const result = await issueFiscalReceipt(companyId, invoiceId, "tester");
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("FISCAL_DAY_NOT_OPEN");
    expect(issueMock).not.toHaveBeenCalled();
  });
});

describe("the Float boundary (FD-0.3)", () => {
  it("takes a cent-exact amount and the double that stands for it", () => {
    expect(centsFromAccountingAmount(115, "t")).toBe(BigInt(11500));
    expect(centsFromAccountingAmount(449.99, "t")).toBe(BigInt(44999));
    // 0.1 + 0.2 is the ledger's 0.30 everywhere else; refusing to sign it would
    // strand a real invoice over a representation artefact.
    expect(centsFromAccountingAmount(0.1 + 0.2, "t")).toBe(BigInt(30));
    expect(centsFromAccountingAmount(-11.5, "t")).toBe(BigInt(-1150));
  });

  it("refuses an amount that is genuinely finer than a cent", () => {
    expect(() => centsFromAccountingAmount(0.005, "total")).toThrow(/finer than one cent/);
    expect(() => centsFromAccountingAmount(1 / 3, "total")).toThrow(/finer than one cent/);
    expect(() => centsFromAccountingAmount(Number.NaN, "total")).toThrow(/finite/);
  });

  /**
   * FD-0.3's acceptance signal: *no fiscal total ever differs from its source
   * document total.*
   *
   * Generated rather than enumerated, because the failure this guards against
   * is not a value anybody would think to write down — it is whichever
   * combination of line amounts happens to accumulate float error past half a
   * cent. The generator is a seeded LCG rather than `fast-check` so the suite
   * gains no dependency and CI cannot go red on a draw nobody can reproduce: a
   * failure here names the exact seed and invoice that produced it.
   *
   * The property is deliberately two-sided. "Equal or throws" is the whole
   * guarantee — the boundary is allowed to refuse an invoice, and is never
   * allowed to sign a total that is not the document's own. A one-sided
   * assertion would pass on a boundary that quietly rounded.
   */
  it("signs the document's own total, or refuses — never something in between", () => {
    // Numerical Recipes LCG. Deterministic, so a failure is reproducible.
    let seed = 0x9e3779b9;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    let refusals = 0;

    for (let trial = 0; trial < 5000; trial += 1) {
      const lineCount = 1 + Math.floor(next() * 40);
      // Whole cents, spanning a tuckshop line item to a bullion invoice.
      const lineCents = Array.from({ length: lineCount }, () =>
        Math.floor(next() * 5_000_000) - 1_000_000,
      );

      // The exact answer, computed in integers and never through a double.
      const exact = lineCents.reduce((sum, cents) => sum + BigInt(cents), BigInt(0));

      // What the accounting layer actually holds: major-unit Floats, summed as
      // Floats. This is the accumulation the boundary exists to catch.
      const floatTotal = lineCents.reduce((sum, cents) => sum + cents / 100, 0);

      let signed: bigint | null = null;
      try {
        signed = centsFromAccountingAmount(floatTotal, "total");
      } catch (error) {
        refusals += 1;
        expect(
          (error as Error).message,
          `seed trial ${trial} refused for the wrong reason`,
        ).toMatch(/finer than one cent|finite/);
        continue;
      }

      expect(
        signed,
        `trial ${trial}: signed total disagrees with the document total for lines ${JSON.stringify(lineCents)}`,
      ).toBe(exact);
    }

    // Not an assertion about correctness — a guard on the test itself. If the
    // boundary began refusing a large share of ordinary invoices the property
    // above would still pass vacuously, and the first anyone would hear of it
    // is a tenant unable to fiscalise.
    expect(refusals, "the boundary refused an implausible share of ordinary invoices").toBeLessThan(
      50,
    );
  });

  it("holds the same property per line, not just on the total", () => {
    // The total is not the only amount that gets signed: every tax line crosses
    // the same boundary, and a per-line disagreement would leave a receipt
    // whose parts do not add up to its own total.
    let seed = 0x85ebca6b;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let trial = 0; trial < 5000; trial += 1) {
      const cents = Math.floor(next() * 100_000_000) - 20_000_000;
      expect(
        centsFromAccountingAmount(cents / 100, "line"),
        `trial ${trial}: ${cents} cents did not round-trip`,
      ).toBe(BigInt(cents));
    }
  });

  it("aggregates invoice tax by ZIMRA taxID and refuses two rates under one", () => {
    const mapped = buildInvoiceSigningInput({
      currency: "USD",
      invoiceDate: DOC_DATE,
      total: 230,
      lines: [
        { description: "a", taxAmount: 15, taxCode: { code: "VAT15", rate: 15, zimraTaxId: 3 } },
        { description: "b", taxAmount: 15, taxCode: { code: "VAT15B", rate: 15, zimraTaxId: 3 } },
        { description: "c", taxAmount: 0, taxCode: { code: "ZERO", rate: 0, zimraTaxId: 2 } },
      ],
    });
    expect(mapped.receiptTotal).toBe(BigInt(23000));
    expect(mapped.taxes).toEqual([
      { taxId: 3, taxPercent: 15, taxAmount: BigInt(3000) },
      // A zero-rated line carries no percent in the canonical string.
      { taxId: 2, taxPercent: null, taxAmount: BigInt(0) },
    ]);

    expect(() =>
      buildInvoiceSigningInput({
        currency: "USD",
        invoiceDate: DOC_DATE,
        total: 230,
        lines: [
          { description: "a", taxAmount: 15, taxCode: { code: "VAT15", rate: 15, zimraTaxId: 3 } },
          { description: "b", taxAmount: 5, taxCode: { code: "VAT5", rate: 5, zimraTaxId: 3 } },
        ],
      }),
    ).toThrow(/different rates/);
  });
});
