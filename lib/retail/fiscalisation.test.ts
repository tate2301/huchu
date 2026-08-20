/**
 * FD-5 — the till receipt as a ZIMRA fiscal document.
 *
 * Two halves, for two different reasons.
 *
 * The mapping half is pure and needs nothing: `buildRetailSaleSigningInput` is
 * handed a sale, its lines and a rate table and either returns exact minor
 * units or refuses by name. That is where the float boundary lives, so it is
 * tested with the awkward doubles a till actually produces rather than with
 * tidy ones.
 *
 * The drain half runs against a real Postgres, because everything it claims is
 * enforced by the database: the fiscal day's counter reservation, the
 * uniqueness of a global number per device, and the rollback that hands a
 * number back when signing refuses. A mocked client would prove the mock. The
 * *transport* is mocked and only the transport — the real
 * `resolveDeviceSigningKey` and `submitReceiptPath` still run, so the receipts
 * these tests inspect were signed with the production code path and no network
 * is opened.
 *
 * The sharp test is the ordering one. A receipt's signature covers the previous
 * receipt's hash, so a batch that fiscalised in parallel would produce a chain
 * in an order nobody chose. Two of the tests below therefore assert not just
 * the resulting numbers but that the connector was never re-entered while a
 * previous submission was still in flight.
 *
 * Run: npx vitest run lib/retail/fiscalisation
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import type { RetailSaleStatus, RetailSaleType } from "@prisma/client";
import { money, percent, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

const { issueMock } = vi.hoisted(() => ({ issueMock: vi.fn() }));

vi.mock("@/lib/accounting/fdms-connector", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/accounting/fdms-connector")>();
  return { ...actual, issueWithFdmsConnector: issueMock };
});

import type { RetailTaxMapping, RetailTaxResolver } from "@/lib/retail/fiscalisation";

const {
  RetailFiscalMappingError,
  buildRetailSaleSigningInput,
  fiscaliseRetailSale,
  fiscaliseRetailSales,
  loadRetailTaxResolver,
  retailReceiptType,
} = await import("@/lib/retail/fiscalisation");
const { openFiscalDay } = await import("@/lib/accounting/fiscal-day");
const {
  FiscalSigningError,
  centsFromMinorUnits,
  hashReceiptInput,
  verifyReceiptChain,
  verifyReceiptSignature,
} = await import("@/lib/accounting/fdms-receipt-signing");

const suite = crypto.randomUUID().slice(0, 8);
const KEY_ENV = `FDMS_RETAIL_BUNDLE_${suite.toUpperCase()}`;
const DEVICE_ID = "20001";

/** 11:00 CAT — the UTC instant and the Harare calendar date agree, so no
 *  assertion here is secretly a timezone assertion. */
const SALE_DATE = new Date("2026-05-15T09:00:00.000Z");

let companyId: string;
let providerConfigId: string;
let publicKeyPem: string;
let certificateRef: string;

/**
 * Products exist only to carry a tax rate back to the sale line.
 *
 * These were `RetailCatalogItem` rows until S-4 retired that table. `Product`
 * is the one item master now and `Product.defaultTaxRate` is where the rate
 * lives, which is what `resolveLineRates` reads.
 */
let itemVat15: string;
let itemZero: string;
let itemUnmapped: string;

let seq = 0;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function connectorSuccess(fiscalNumber = "FDMS-OK") {
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

function connectorFailure(error = "FDMS unreachable") {
  return {
    status: "FAILED" as const,
    fiscalNumber: null,
    providerReference: null,
    qrCodeData: null,
    signature: null,
    rawResponseJson: JSON.stringify({ error }),
    error,
    nextRetryAt: new Date(Date.now() + 60_000),
  };
}

/** A rate table without a database, for the pure half. */
function stubResolver(mappings: RetailTaxMapping[]): RetailTaxResolver {
  return {
    resolve(ratePercent, context) {
      const found = mappings.find((mapping) => mapping.rate === ratePercent);
      if (!found) {
        throw new RetailFiscalMappingError(
          "RETAIL_TAX_RATE_UNMAPPED",
          `No active tax code with a ZIMRA taxID charges ${ratePercent}% (${context})`,
        );
      }
      return found;
    },
  };
}

const VAT15: RetailTaxMapping = { taxId: 1, code: "VAT15", percent: "15.00", rate: 15 };
const ZERO: RetailTaxMapping = { taxId: 2, code: "ZERO", percent: "0.00", rate: 0 };

type LineSpec = { productId: string; taxAmount: number; lineTotal: number };

async function makeSale(input: {
  saleType?: RetailSaleType;
  status?: RetailSaleStatus;
  currency?: string;
  totalAmount: number;
  taxAmount: number;
  lines: LineSpec[];
  sourceSaleId?: string;
  postedAt?: Date;
}) {
  seq += 1;
  return prisma.retailSale.create({
    data: {
      companyId,
      saleNo: `FD5-${suite}-${seq}`,
      siteId: `site-${suite}`,
      saleType: input.saleType ?? "SALE",
      status: input.status ?? "POSTED",
      currency: input.currency ?? "USD",
      sourceSaleId: input.sourceSaleId ?? null,
      subtotal: money(input.totalAmount).minus(money(input.taxAmount)),
      taxAmount: money(input.taxAmount),
      totalAmount: money(input.totalAmount),
      postedAt: input.postedAt ?? SALE_DATE,
      lines: {
        // R-1.3 put `companyId` on the line tables, so an unchecked create has
        // to carry it: the sale it hangs off is not enough any more.
        create: input.lines.map((line, index) => ({
          companyId,
          inventoryItemId: `inv-${suite}-${index}`,
          productId: line.productId,
          itemName: `Item ${index + 1}`,
          quantity: quantity(1),
          unitPrice: money(line.lineTotal),
          taxAmount: money(line.taxAmount),
          lineTotal: money(line.lineTotal),
        })),
      },
    },
    select: { id: true, saleNo: true },
  });
}

/** A $115.00 sale carrying $15.00 of 15% VAT — the shape most tests want. */
function standardSale() {
  return makeSale({
    totalAmount: 115,
    taxAmount: 15,
    lines: [{ productId: itemVat15, taxAmount: 15, lineTotal: 115 }],
  });
}

async function openDay() {
  return openFiscalDay({ companyId, providerConfigId });
}

async function receiptsInChainOrder() {
  return prisma.fiscalReceipt.findMany({
    where: { companyId },
    orderBy: { receiptGlobalNo: "asc" },
  });
}

/** The native receipt block the connector was handed on call `index`. */
function wireAt(index: number) {
  const call = issueMock.mock.calls[index]?.[0] as
    | { payload: { payload: Record<string, unknown> } }
    | undefined;
  return call?.payload.payload as Record<string, unknown> | undefined;
}

beforeAll(async () => {
  await prisma.$connect();

  const keypair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  publicKeyPem = keypair.publicKey;
  certificateRef = `env:${KEY_ENV}`;
  process.env[KEY_ENV] = JSON.stringify({ key: keypair.privateKey });

  const company = await prisma.company.create({
    data: { name: "FD-5 Retail Fiscalisation Test Co", slug: `fd5-${suite}` },
    select: { id: true },
  });
  companyId = company.id;

  const provider = await prisma.fiscalisationProviderConfig.create({
    data: {
      companyId,
      providerKey: `zimra-${suite}`,
      apiBaseUrl: "https://fdms.invalid",
      deviceId: DEVICE_ID,
      certificateRef,
      isActive: true,
    },
    select: { id: true },
  });
  providerConfigId = provider.id;

  await prisma.taxCode.createMany({
    data: [
      { companyId, code: `VAT15-${suite}`, name: "Standard VAT", rate: 15, zimraTaxId: 1, appliesTo: "SALES" },
      { companyId, code: `ZERO-${suite}`, name: "Zero rated", rate: 0, zimraTaxId: 2, appliesTo: "BOTH" },
      // Real, active, sales-facing — and deliberately unmapped, which is the
      // whole of invariant 4: a rate with no zimraTaxId cannot be signed.
      { companyId, code: `LUX5-${suite}`, name: "Luxury 5%", rate: 5, zimraTaxId: null, appliesTo: "SALES" },
    ],
  });

  const catalogue = await Promise.all(
    [
      { code: "STD15", taxPercent: 15 },
      { code: "ZERO", taxPercent: 0 },
      { code: "LUX5", taxPercent: 5 },
    ].map((spec) =>
      prisma.product.create({
        data: {
          companyId,
          code: `${spec.code}-${suite}`,
          name: spec.code,
          standardPrice: money(100),
          defaultTaxRate: percent(spec.taxPercent),
        },
        select: { id: true },
      }),
    ),
  );
  [itemVat15, itemZero, itemUnmapped] = catalogue.map((item) => item.id);
});

afterAll(async () => {
  delete process.env[KEY_ENV];
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  issueMock.mockReset();
  issueMock.mockResolvedValue(connectorSuccess());
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.fiscalDay.deleteMany({ where: { companyId } });
  // Restored every time: one test takes the device key away mid-batch.
  await prisma.fiscalisationProviderConfig.update({
    where: { id: providerConfigId },
    data: { certificateRef, isActive: true },
  });
});

// ---------------------------------------------------------------------------
// Receipt type
// ---------------------------------------------------------------------------

describe("what kind of document a till sale is", () => {
  it("calls a sale a fiscal invoice", () => {
    expect(retailReceiptType("SALE")).toBe("FISCALINVOICE");
  });

  it("calls a REFUND a credit note, never a negative sale", () => {
    // ZIMRA has no negative sale: a refund reduces a receipt that was already
    // given to them, which is a CREDITNOTE and nothing else.
    expect(retailReceiptType("REFUND")).toBe("CREDITNOTE");
  });

  it("calls a VOID a credit note for the same reason", () => {
    expect(retailReceiptType("VOID")).toBe("CREDITNOTE");
  });

  it("refuses a sale type it has no receipt type for", () => {
    expect(() => retailReceiptType("LAYBY")).toThrowError(
      expect.objectContaining({ code: "RETAIL_SALE_TYPE_UNKNOWN" }),
    );
  });
});

// ---------------------------------------------------------------------------
// The float boundary and the refusals — pure
// ---------------------------------------------------------------------------

describe("the float boundary (invariant 5)", () => {
  it("hands the signer exact minor units and never a number", () => {
    const bundle = buildRetailSaleSigningInput({
      sale: {
        saleNo: "S-1",
        saleType: "SALE",
        currency: "USD",
        totalAmount: 115,
        taxAmount: 15,
        receiptDate: SALE_DATE,
      },
      lines: [{ itemName: "Mealie meal", taxAmount: 15, lineTotal: 115, taxPercent: 15 }],
      resolver: stubResolver([VAT15]),
    });

    expect(typeof bundle.fiscal.receiptTotal).toBe("bigint");
    expect(bundle.fiscal.receiptTotal).toBe(BigInt(11500));
    expect(bundle.fiscal.taxes).toHaveLength(1);
    expect(typeof bundle.fiscal.taxes[0].taxAmount).toBe("bigint");
    expect(bundle.fiscal.taxes[0].taxAmount).toBe(BigInt(1500));
    expect(bundle.taxLines[0]).toMatchObject({
      taxId: 1,
      taxAmountCents: BigInt(1500),
      salesAmountCents: BigInt(11500),
    });
  });

  it("reads a double that is a cent in disguise as that cent", () => {
    // 10.1 + 10.2 + 10.0 in doubles. The till charged $30.30 and the slip says
    // so; refusing to sign it would strand a real sale.
    const total = 10.1 + 10.2 + 10.0;
    expect(total).not.toBe(30.3);

    const bundle = buildRetailSaleSigningInput({
      sale: {
        saleNo: "S-2",
        saleType: "SALE",
        currency: "USD",
        totalAmount: total,
        taxAmount: 3.95,
        receiptDate: SALE_DATE,
      },
      lines: [{ itemName: "Basket", taxAmount: 3.95, lineTotal: total, taxPercent: 15 }],
      resolver: stubResolver([VAT15]),
    });

    expect(bundle.fiscal.receiptTotal).toBe(BigInt(3030));
  });

  it("refuses an amount finer than a cent instead of rounding it into a signature", () => {
    expect(() =>
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "S-3",
          saleType: "SALE",
          currency: "USD",
          totalAmount: 10.005,
          taxAmount: 1.3,
          receiptDate: SALE_DATE,
        },
        lines: [{ itemName: "Fuel", taxAmount: 1.3, lineTotal: 10.005, taxPercent: 15 }],
        resolver: stubResolver([VAT15]),
      }),
    ).toThrowError(FiscalSigningError);
  });
});

describe("a rate that cannot be resolved (invariant 4)", () => {
  it("is refused by name rather than guessed", () => {
    let thrown: unknown;
    try {
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "S-4",
          saleType: "SALE",
          currency: "USD",
          totalAmount: 105,
          taxAmount: 5,
          receiptDate: SALE_DATE,
        },
        lines: [{ itemName: "Whisky", taxAmount: 5, lineTotal: 105, taxPercent: 5 }],
        resolver: stubResolver([VAT15, ZERO]),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RetailFiscalMappingError);
    expect(thrown).toMatchObject({ code: "RETAIL_TAX_RATE_UNMAPPED" });
    expect((thrown as Error).message).toContain("Whisky");
  });

  it("stops the whole receipt, not just the line", () => {
    // One unmapped line poisons the document: the total and the tax breakdown
    // are signed together, so there is no partial receipt to issue.
    expect(() =>
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "S-5",
          saleType: "SALE",
          currency: "USD",
          totalAmount: 220,
          taxAmount: 20,
          receiptDate: SALE_DATE,
        },
        lines: [
          { itemName: "Bread", taxAmount: 15, lineTotal: 115, taxPercent: 15 },
          { itemName: "Whisky", taxAmount: 5, lineTotal: 105, taxPercent: 5 },
        ],
        resolver: stubResolver([VAT15]),
      }),
    ).toThrowError(expect.objectContaining({ code: "RETAIL_TAX_RATE_UNMAPPED" }));
  });
});

describe("a reversal's sign and totals", () => {
  it("signs a refund as a negative credit note (invariant 3)", () => {
    const bundle = buildRetailSaleSigningInput({
      sale: {
        saleNo: "R-1",
        saleType: "REFUND",
        currency: "USD",
        totalAmount: -115,
        taxAmount: -15,
        receiptDate: SALE_DATE,
      },
      lines: [{ itemName: "Mealie meal", taxAmount: -15, lineTotal: -115, taxPercent: 15 }],
      resolver: stubResolver([VAT15]),
    });

    expect(bundle.fiscal.receiptType).toBe("CREDITNOTE");
    expect(bundle.fiscal.receiptTotal).toBe(BigInt(-11500));
    expect(bundle.fiscal.taxes[0].taxAmount).toBe(BigInt(-1500));
  });

  it("refuses a reversal whose total is positive", () => {
    expect(() =>
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "R-2",
          saleType: "REFUND",
          currency: "USD",
          totalAmount: 115,
          taxAmount: 15,
          receiptDate: SALE_DATE,
        },
        lines: [{ itemName: "Mealie meal", taxAmount: 15, lineTotal: 115, taxPercent: 15 }],
        resolver: stubResolver([VAT15]),
      }),
    ).toThrowError(expect.objectContaining({ code: "RETAIL_SIGN_MISMATCH" }));
  });

  it("refuses a sale whose total is negative", () => {
    expect(() =>
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "S-6",
          saleType: "SALE",
          currency: "USD",
          totalAmount: -115,
          taxAmount: -15,
          receiptDate: SALE_DATE,
        },
        lines: [{ itemName: "Mealie meal", taxAmount: -15, lineTotal: -115, taxPercent: 15 }],
        resolver: stubResolver([VAT15]),
      }),
    ).toThrowError(expect.objectContaining({ code: "RETAIL_SIGN_MISMATCH" }));
  });

  it("refuses a receipt whose lines do not add up to its total", () => {
    expect(() =>
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "S-7",
          saleType: "SALE",
          currency: "USD",
          totalAmount: 120,
          taxAmount: 15,
          receiptDate: SALE_DATE,
        },
        lines: [{ itemName: "Bread", taxAmount: 15, lineTotal: 115, taxPercent: 15 }],
        resolver: stubResolver([VAT15]),
      }),
    ).toThrowError(expect.objectContaining({ code: "RETAIL_TOTALS_INCONSISTENT" }));
  });

  it("refuses a receipt whose declared tax disagrees with its lines", () => {
    expect(() =>
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "S-8",
          saleType: "SALE",
          currency: "USD",
          totalAmount: 115,
          taxAmount: 14,
          receiptDate: SALE_DATE,
        },
        lines: [{ itemName: "Bread", taxAmount: 15, lineTotal: 115, taxPercent: 15 }],
        resolver: stubResolver([VAT15]),
      }),
    ).toThrowError(expect.objectContaining({ code: "RETAIL_TOTALS_INCONSISTENT" }));
  });

  it("refuses a line the catalogue rate no longer explains", () => {
    // The catalogue was edited during a load-shedding gap. Signing this would
    // relabel a queued sale's VAT after the customer walked out with the slip.
    expect(() =>
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "S-9",
          saleType: "SALE",
          currency: "USD",
          totalAmount: 115,
          taxAmount: 5,
          receiptDate: SALE_DATE,
        },
        lines: [{ itemName: "Bread", taxAmount: 5, lineTotal: 115, taxPercent: 15 }],
        resolver: stubResolver([VAT15]),
      }),
    ).toThrowError(expect.objectContaining({ code: "RETAIL_TAX_RATE_DRIFTED" }));
  });

  it("refuses a sale with no lines", () => {
    expect(() =>
      buildRetailSaleSigningInput({
        sale: {
          saleNo: "S-10",
          saleType: "SALE",
          currency: "USD",
          totalAmount: 0,
          taxAmount: 0,
          receiptDate: SALE_DATE,
        },
        lines: [],
        resolver: stubResolver([VAT15]),
      }),
    ).toThrowError(expect.objectContaining({ code: "RETAIL_SALE_NO_LINES" }));
  });
});

describe("tax lines as ZIMRA counts them", () => {
  it("aggregates by taxID, sorts by it, and leaves a zero-rated bucket without a percent", () => {
    const bundle = buildRetailSaleSigningInput({
      sale: {
        saleNo: "S-11",
        saleType: "SALE",
        currency: "USD",
        totalAmount: 240,
        taxAmount: 30,
        receiptDate: SALE_DATE,
      },
      lines: [
        { itemName: "Milk", taxAmount: 0, lineTotal: 10, taxPercent: 0 },
        { itemName: "Bread", taxAmount: 15, lineTotal: 115, taxPercent: 15 },
        { itemName: "Soap", taxAmount: 15, lineTotal: 115, taxPercent: 15 },
      ],
      resolver: stubResolver([VAT15, ZERO]),
    });

    expect(bundle.fiscal.taxes.map((line) => line.taxId)).toEqual([1, 2]);
    expect(bundle.fiscal.taxes[0]).toMatchObject({ taxPercent: 15, taxAmount: BigInt(3000) });
    // Exempt and zero-rated carry no rate in the canonical string.
    expect(bundle.fiscal.taxes[1]).toMatchObject({ taxPercent: null, taxAmount: BigInt(0) });
    expect(bundle.taxLines[0].salesAmountCents).toBe(BigInt(23000));
    expect(bundle.taxLines[1].salesAmountCents).toBe(BigInt(1000));
  });
});

// ---------------------------------------------------------------------------
// The tenant's rate table — against the database
// ---------------------------------------------------------------------------

describe("loadRetailTaxResolver", () => {
  it("maps a till rate to the tenant's ZIMRA taxID", async () => {
    const resolver = await loadRetailTaxResolver({ companyId, asOf: SALE_DATE });
    expect(resolver.resolve(15, "test")).toMatchObject({ taxId: 1, percent: "15.00" });
    expect(resolver.resolve(0, "test")).toMatchObject({ taxId: 2, percent: "0.00" });
  });

  it("treats 15, 15.0 and 15.00 as one bucket", async () => {
    const resolver = await loadRetailTaxResolver({ companyId, asOf: SALE_DATE });
    expect(resolver.resolve(15.0, "test").taxId).toBe(1);
    expect(resolver.resolve(15.004, "test").taxId).toBe(1);
  });

  it("refuses a rate whose only tax code has no ZIMRA taxID (invariant 4)", async () => {
    const resolver = await loadRetailTaxResolver({ companyId, asOf: SALE_DATE });
    expect(() => resolver.resolve(5, "Whisky on S-1")).toThrowError(
      expect.objectContaining({ code: "RETAIL_TAX_RATE_UNMAPPED" }),
    );
  });

  it("refuses a rate two codes claim under different taxIDs", async () => {
    // Exempt and zero-rated both sit at 0%. The till records a percentage and
    // nothing else, so there is no honest way to pick between them.
    const exempt = await prisma.taxCode.create({
      data: {
        companyId,
        code: `EXEMPT-${suite}`,
        name: "Exempt",
        rate: 0,
        zimraTaxId: 3,
        appliesTo: "SALES",
      },
      select: { id: true },
    });
    try {
      const resolver = await loadRetailTaxResolver({ companyId, asOf: SALE_DATE });
      expect(() => resolver.resolve(0, "Milk on S-1")).toThrowError(
        expect.objectContaining({ code: "RETAIL_TAX_RATE_AMBIGUOUS" }),
      );
      // 15% is untouched: one bad bucket does not take the rest of the table
      // down with it.
      expect(resolver.resolve(15, "test").taxId).toBe(1);
    } finally {
      await prisma.taxCode.delete({ where: { id: exempt.id } });
    }
  });

  it("ignores a code that was not yet effective when the sale was rung", async () => {
    const future = await prisma.taxCode.create({
      data: {
        companyId,
        code: `VAT12-${suite}`,
        name: "Reduced VAT",
        rate: 12,
        zimraTaxId: 9,
        appliesTo: "SALES",
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
    try {
      const resolver = await loadRetailTaxResolver({ companyId, asOf: SALE_DATE });
      expect(() => resolver.resolve(12, "test")).toThrowError(
        expect.objectContaining({ code: "RETAIL_TAX_RATE_UNMAPPED" }),
      );
      const later = await loadRetailTaxResolver({
        companyId,
        asOf: new Date("2026-10-01T00:00:00.000Z"),
      });
      expect(later.resolve(12, "test").taxId).toBe(9);
    } finally {
      await prisma.taxCode.delete({ where: { id: future.id } });
    }
  });

  it("ignores withholding and purchase-only codes", async () => {
    const noise = await prisma.taxCode.createManyAndReturn({
      data: [
        {
          companyId,
          code: `WHT10-${suite}`,
          name: "Withholding",
          rate: 10,
          type: "WITHHOLDING",
          zimraTaxId: 7,
          appliesTo: "SALES",
        },
        {
          companyId,
          code: `IMP10-${suite}`,
          name: "Import VAT",
          rate: 10,
          zimraTaxId: 8,
          appliesTo: "PURCHASE",
        },
      ],
      select: { id: true },
    });
    try {
      const resolver = await loadRetailTaxResolver({ companyId, asOf: SALE_DATE });
      // Neither is a supply's VAT treatment, so 10% stays unmapped rather than
      // becoming ambiguous.
      expect(() => resolver.resolve(10, "test")).toThrowError(
        expect.objectContaining({ code: "RETAIL_TAX_RATE_UNMAPPED" }),
      );
    } finally {
      await prisma.taxCode.deleteMany({ where: { id: { in: noise.map((row) => row.id) } } });
    }
  });
});

// ---------------------------------------------------------------------------
// One sale, end to end
// ---------------------------------------------------------------------------

describe("fiscalising one till sale", () => {
  it("signs it, chains it and hands back a scannable slip before FDMS answers", async () => {
    await openDay();
    issueMock.mockResolvedValue({ ...connectorSuccess(), status: "PENDING" as const });
    const sale = await standardSale();

    const result = await fiscaliseRetailSale({ companyId, saleId: sale.id });

    expect(result.fiscalStatus).toBe("PENDING");
    expect(result.receiptGlobalNo).toBe(1);
    // The QR is derived from the signature, so it exists the moment the receipt
    // is signed — which is what lets a till print while FDMS is still silent.
    expect(result.qrCodeData).toMatch(/^https:\/\/fdms\.zimra\.co\.zw\//);
    expect(result.blocksDevice).toBe(false);

    const receipt = await prisma.fiscalReceipt.findFirstOrThrow({
      where: { retailSaleId: sale.id },
    });
    expect(receipt.receiptType).toBe("FISCALINVOICE");
    expect(receipt.receiptCurrency).toBe("USD");
    expect(receipt.receiptCounter).toBe(1);
    expect(receipt.signature).toBeTruthy();
  });

  it("signs the exact minor units and nothing a float ever touched (invariant 5)", async () => {
    await openDay();
    // The awkward total again, this time all the way through the database.
    const total = 10.1 + 10.2 + 10.0;
    const sale = await makeSale({
      totalAmount: total,
      taxAmount: 3.95,
      lines: [{ productId: itemVat15, taxAmount: 3.95, lineTotal: total }],
    });

    await fiscaliseRetailSale({ companyId, saleId: sale.id });

    const receipt = await prisma.fiscalReceipt.findFirstOrThrow({
      where: { retailSaleId: sale.id },
    });

    // Re-derive the hash from exact `Cents`. If any float had reached the
    // canonical string this would not match, because 3029.9999999999995 and
    // 3030 do not stringify the same way.
    const expectedHash = hashReceiptInput({
      deviceId: DEVICE_ID,
      receiptType: "FISCALINVOICE",
      receiptCurrency: "USD",
      receiptGlobalNo: receipt.receiptGlobalNo!,
      receiptDate: SALE_DATE,
      receiptTotal: centsFromMinorUnits(3030),
      taxes: [{ taxId: 1, taxPercent: 15, taxAmount: centsFromMinorUnits(395) }],
      previousReceiptHash: receipt.previousReceiptHash,
    });
    expect(receipt.receiptHash).toBe(expectedHash);
    expect(
      verifyReceiptSignature({
        hash: receipt.receiptHash!,
        signature: receipt.signature!,
        publicKeyPem,
      }),
    ).toBe(true);

    // And what went on the wire is a decimal string of minor units, never a
    // JSON number that would put the total back through a double.
    const wire = wireAt(0)?.receipt as Record<string, unknown>;
    expect(wire.receiptTotalCents).toBe("3030");
    expect((wire.receiptTaxes as Array<Record<string, unknown>>)[0].taxAmountCents).toBe("395");
  });

  it("refuses a sale whose rate has no taxID, and reserves no number for it (invariant 4)", async () => {
    await openDay();
    const sale = await makeSale({
      totalAmount: 105,
      taxAmount: 5,
      lines: [{ productId: itemUnmapped, taxAmount: 5, lineTotal: 105 }],
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: sale.id });

    expect(result.fiscalStatus).toBe("FAILED");
    expect(result.errorCode).toBe("RETAIL_TAX_RATE_UNMAPPED");
    expect(result.blocksDevice).toBe(false);
    expect(issueMock).not.toHaveBeenCalled();
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);
    // Nothing was reserved, so the day is exactly where it was.
    const day = await prisma.fiscalDay.findFirstOrThrow({ where: { companyId } });
    expect(day.lastReceiptGlobalNo).toBe(0);
  });

  it("refuses a sub-cent amount rather than rounding it into a signature (invariant 5)", async () => {
    await openDay();
    const sale = await makeSale({
      totalAmount: 10.005,
      taxAmount: 1.3,
      lines: [{ productId: itemVat15, taxAmount: 1.3, lineTotal: 10.005 }],
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: sale.id });

    expect(result.fiscalStatus).toBe("FAILED");
    expect(result.errorCode).toBe("FISCAL_SIGNING_REFUSED");
    expect(issueMock).not.toHaveBeenCalled();
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);
  });

  it("skips a tenant with no fiscal device, silently", async () => {
    await prisma.fiscalisationProviderConfig.update({
      where: { id: providerConfigId },
      data: { isActive: false },
    });
    const sale = await standardSale();

    const result = await fiscaliseRetailSale({ companyId, saleId: sale.id });

    expect(result.fiscalStatus).toBe("SKIPPED");
    expect(result.errorCode).toBeNull();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("skips a sale that was voided before it was ever drained", async () => {
    await openDay();
    const sale = await makeSale({
      status: "VOIDED",
      totalAmount: 115,
      taxAmount: 15,
      lines: [{ productId: itemVat15, taxAmount: 15, lineTotal: 115 }],
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: sale.id });

    expect(result.fiscalStatus).toBe("SKIPPED");
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("reports a sale that is not this company's rather than issuing anything", async () => {
    const result = await fiscaliseRetailSale({ companyId, saleId: crypto.randomUUID() });
    expect(result.fiscalStatus).toBe("FAILED");
    expect(result.errorCode).toBe("RETAIL_SALE_NOT_FOUND");
  });

  it("halts the device when no fiscal day is open", async () => {
    const sale = await standardSale();

    const result = await fiscaliseRetailSale({ companyId, saleId: sale.id });

    expect(result.fiscalStatus).toBe("FAILED");
    expect(result.errorCode).toBe("FISCAL_DAY_NOT_OPEN");
    // Every later sale would fail identically, so the drain must stop.
    expect(result.blocksDevice).toBe(true);
  });

  it("refuses a line with no catalogue item rather than defaulting it to 0%", async () => {
    await openDay();
    seq += 1;
    const sale = await prisma.retailSale.create({
      data: {
        companyId,
        saleNo: `FD5-${suite}-${seq}`,
        siteId: `site-${suite}`,
        currency: "USD",
        status: "POSTED",
        postedAt: SALE_DATE,
        subtotal: money(100),
        taxAmount: money(15),
        totalAmount: money(115),
        lines: {
          create: [
            {
              companyId,
              inventoryItemId: `inv-${suite}-orphan`,
              // The line this test is about: no product, so no rate to sign at.
              productId: null,
              itemName: "Orphaned line",
              quantity: quantity(1),
              unitPrice: money(115),
              taxAmount: money(15),
              lineTotal: money(115),
            },
          ],
        },
      },
      select: { id: true },
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: sale.id });

    // "Zero-rated" is a VAT treatment, not a fallback: a sale signed at 0%
    // because a lookup missed is an understated return.
    expect(result.fiscalStatus).toBe("FAILED");
    expect(result.errorCode).toBe("RETAIL_LINE_TAX_UNKNOWN");
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);
  });

  it("re-drains an accepted sale without signing a second receipt for it", async () => {
    // The sync route replays operations, and the offline queue replays whole
    // batches. Signing a second receipt for one sale would take a number the
    // chain can never account for.
    await openDay();
    const sale = await standardSale();

    const first = await fiscaliseRetailSale({ companyId, saleId: sale.id });
    const second = await fiscaliseRetailSale({ companyId, saleId: sale.id });

    expect(first.fiscalStatus).toBe("SUCCESS");
    expect(second.fiscalStatus).toBe("SUCCESS");
    expect(second.fiscalReceiptId).toBe(first.fiscalReceiptId);
    expect(issueMock).toHaveBeenCalledTimes(1);
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(1);
    const day = await prisma.fiscalDay.findFirstOrThrow({ where: { companyId } });
    expect(day.lastReceiptGlobalNo).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Refunds — invariant 3
// ---------------------------------------------------------------------------

describe("a refund is a credit note against the original (invariant 3)", () => {
  it("cites the original receipt's global number and signs a negative total", async () => {
    await openDay();
    const original = await standardSale();
    await fiscaliseRetailSale({ companyId, saleId: original.id });
    const originalReceipt = await prisma.fiscalReceipt.findFirstOrThrow({
      where: { retailSaleId: original.id },
    });

    const refund = await makeSale({
      saleType: "REFUND",
      sourceSaleId: original.id,
      totalAmount: -115,
      taxAmount: -15,
      lines: [{ productId: itemVat15, taxAmount: -15, lineTotal: -115 }],
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: refund.id });

    expect(result.fiscalStatus).toBe("SUCCESS");
    const receipt = await prisma.fiscalReceipt.findFirstOrThrow({
      where: { retailSaleId: refund.id },
    });
    expect(receipt.receiptType).toBe("CREDITNOTE");
    expect(receipt.receiptGlobalNo).toBe(2);

    const wire = wireAt(1);
    expect(wire?.documentType).toBe("RETAIL_CREDIT_NOTE");
    expect(wire?.creditDebitNote).toMatchObject({
      receiptID: originalReceipt.id,
      receiptGlobalNo: originalReceipt.receiptGlobalNo,
      originalSaleNo: original.saleNo,
    });
    expect((wire?.receipt as Record<string, unknown>).receiptTotalCents).toBe("-11500");
  });

  it("skips a refund whose original ZIMRA never saw", async () => {
    await openDay();
    // Fiscalised nothing: the original stays a plain row.
    const original = await standardSale();
    const refund = await makeSale({
      saleType: "REFUND",
      sourceSaleId: original.id,
      totalAmount: -115,
      taxAmount: -15,
      lines: [{ productId: itemVat15, taxAmount: -15, lineTotal: -115 }],
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: refund.id });

    // Not a failure: there is nothing at ZIMRA to reduce, and a bare credit
    // note would move a day's counters against a receipt they do not hold.
    expect(result.fiscalStatus).toBe("SKIPPED");
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("treats a VOID reversal as a credit note too", async () => {
    await openDay();
    const original = await standardSale();
    await fiscaliseRetailSale({ companyId, saleId: original.id });
    // The void reversal is what the retail service writes; the sale it reverses
    // is left VOIDED and is not re-fiscalised.
    await prisma.retailSale.update({ where: { id: original.id }, data: { status: "VOIDED" } });

    const reversal = await makeSale({
      saleType: "VOID",
      sourceSaleId: original.id,
      totalAmount: -115,
      taxAmount: -15,
      lines: [{ productId: itemVat15, taxAmount: -15, lineTotal: -115 }],
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: reversal.id });

    expect(result.fiscalStatus).toBe("SUCCESS");
    const receipt = await prisma.fiscalReceipt.findFirstOrThrow({
      where: { retailSaleId: reversal.id },
    });
    expect(receipt.receiptType).toBe("CREDITNOTE");
  });

  it("refuses a credit note whose original was fiscalised without a global number", async () => {
    await openDay();
    const original = await standardSale();
    // The pre-native skeleton path: a row with a provider reference and no
    // counters at all. There is nothing for a credit note to cite.
    await prisma.fiscalReceipt.create({
      data: {
        companyId,
        retailSaleId: original.id,
        status: "SUCCESS",
        providerKey: `zimra-${suite}`,
        fiscalNumber: "LEGACY-1",
      },
    });

    const refund = await makeSale({
      saleType: "REFUND",
      sourceSaleId: original.id,
      totalAmount: -115,
      taxAmount: -15,
      lines: [{ productId: itemVat15, taxAmount: -15, lineTotal: -115 }],
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: refund.id });

    expect(result.fiscalStatus).toBe("FAILED");
    expect(result.errorCode).toBe("RETAIL_ORIGINAL_NOT_SIGNED");
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("refuses a credit note in a different currency from the receipt it reduces", async () => {
    await openDay();
    const original = await standardSale();
    await fiscaliseRetailSale({ companyId, saleId: original.id });

    const refund = await makeSale({
      saleType: "REFUND",
      sourceSaleId: original.id,
      currency: "ZWG",
      totalAmount: -115,
      taxAmount: -15,
      lines: [{ productId: itemVat15, taxAmount: -15, lineTotal: -115 }],
    });

    const result = await fiscaliseRetailSale({ companyId, saleId: refund.id });

    expect(result.fiscalStatus).toBe("FAILED");
    expect(result.errorCode).toBe("RETAIL_SIGN_MISMATCH");
    expect(await prisma.fiscalReceipt.count({ where: { retailSaleId: refund.id } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The batch — invariants 1 and 2
// ---------------------------------------------------------------------------

describe("draining a batch of queued sales (invariant 1)", () => {
  it("fiscalises in the order the till rang them, gap-free", async () => {
    await openDay();
    const sales = [await standardSale(), await standardSale(), await standardSale()];

    const results = await fiscaliseRetailSales({
      companyId,
      saleIds: sales.map((sale) => sale.id),
    });

    expect(results.map((result) => result.fiscalStatus)).toEqual([
      "SUCCESS",
      "SUCCESS",
      "SUCCESS",
    ]);
    expect(results.map((result) => result.receiptGlobalNo)).toEqual([1, 2, 3]);

    const receipts = await receiptsInChainOrder();
    expect(receipts.map((receipt) => receipt.retailSaleId)).toEqual(sales.map((s) => s.id));
    expect(receipts.map((receipt) => receipt.receiptCounter)).toEqual([1, 2, 3]);
    // Each receipt's signature covers the previous receipt's hash. That is the
    // whole reason the batch may not be a Promise.all.
    expect(receipts[0].previousReceiptHash).toBeNull();
    expect(receipts[1].previousReceiptHash).toBe(receipts[0].receiptHash);
    expect(receipts[2].previousReceiptHash).toBe(receipts[1].receiptHash);

    // Re-derive every hash from the receipt's own fields. This is the audit
    // ZIMRA can run years later: a receipt signed against the wrong
    // predecessor, or edited afterwards, fails at that receipt and not merely
    // at the end of the run.
    expect(
      verifyReceiptChain(
        receipts.map((receipt) => ({
          input: {
            deviceId: DEVICE_ID,
            receiptType: "FISCALINVOICE" as const,
            receiptCurrency: "USD",
            receiptGlobalNo: receipt.receiptGlobalNo!,
            receiptDate: SALE_DATE,
            receiptTotal: centsFromMinorUnits(11500),
            taxes: [{ taxId: 1, taxPercent: 15, taxAmount: centsFromMinorUnits(1500) }],
            previousReceiptHash: receipt.previousReceiptHash,
          },
          receiptHash: receipt.receiptHash!,
        })),
      ),
    ).toEqual({ ok: true });
  });

  it("never starts a sale before the previous one has finished", async () => {
    await openDay();
    const timeline: string[] = [];
    let live = 0;
    issueMock.mockImplementation(async () => {
      live += 1;
      timeline.push(`enter:${live}`);
      // Yield the event loop for long enough that a parallel drain interleaves
      // here. A sequential one cannot: nothing else is running.
      await new Promise((resolve) => setTimeout(resolve, 20));
      timeline.push(`exit:${live}`);
      live -= 1;
      return connectorSuccess();
    });

    const sales = [await standardSale(), await standardSale(), await standardSale()];
    await fiscaliseRetailSales({ companyId, saleIds: sales.map((sale) => sale.id) });

    expect(issueMock).toHaveBeenCalledTimes(3);
    // Strictly enter/exit/enter/exit — one submission on the wire at a time,
    // because receipt N's signature covers receipt N-1's hash.
    expect(timeline).toEqual([
      "enter:1",
      "exit:1",
      "enter:1",
      "exit:1",
      "enter:1",
      "exit:1",
    ]);
  });
});

describe("a mid-batch failure (invariant 2)", () => {
  it("skips the sale it is about and leaves no gap behind it", async () => {
    await openDay();
    const first = await standardSale();
    const bad = await makeSale({
      totalAmount: 105,
      taxAmount: 5,
      lines: [{ productId: itemUnmapped, taxAmount: 5, lineTotal: 105 }],
    });
    const last = await standardSale();

    const results = await fiscaliseRetailSales({
      companyId,
      saleIds: [first.id, bad.id, last.id],
    });

    expect(results.map((result) => result.fiscalStatus)).toEqual([
      "SUCCESS",
      "FAILED",
      "SUCCESS",
    ]);
    expect(results[1].errorCode).toBe("RETAIL_TAX_RATE_UNMAPPED");

    // The refused sale never reserved a number, so it has no place in the chain
    // to leave a gap in — and the sale after it takes the next number, not the
    // one after next.
    const receipts = await receiptsInChainOrder();
    expect(receipts).toHaveLength(2);
    expect(receipts.map((receipt) => receipt.receiptGlobalNo)).toEqual([1, 2]);
    expect(receipts[1].previousReceiptHash).toBe(receipts[0].receiptHash);
    expect(receipts[1].retailSaleId).toBe(last.id);
  });

  it("lets a transport failure keep its place in the chain", async () => {
    await openDay();
    const sales = [await standardSale(), await standardSale(), await standardSale()];
    issueMock
      .mockResolvedValueOnce(connectorSuccess())
      .mockResolvedValueOnce(connectorFailure())
      .mockResolvedValueOnce(connectorSuccess());

    const results = await fiscaliseRetailSales({
      companyId,
      saleIds: sales.map((sale) => sale.id),
    });

    expect(results.map((result) => result.fiscalStatus)).toEqual([
      "SUCCESS",
      "FAILED",
      "SUCCESS",
    ]);
    // The middle receipt was signed and numbered before the network was
    // touched, so it holds global no 2 and replay resends the SAME bytes. The
    // third sale must not slide into its place.
    const receipts = await receiptsInChainOrder();
    expect(receipts.map((receipt) => receipt.receiptGlobalNo)).toEqual([1, 2, 3]);
    expect(receipts.map((receipt) => receipt.retailSaleId)).toEqual(sales.map((s) => s.id));
    expect(receipts[1].status).toBe("FAILED");
    expect(receipts[1].receiptHash).toBeTruthy();
    expect(receipts[2].previousReceiptHash).toBe(receipts[1].receiptHash);
  });

  it("halts the drain on a device failure and signs nothing onto the chain after it", async () => {
    await openDay();
    const sales = [await standardSale(), await standardSale(), await standardSale()];

    // The device key disappears after the first submission — a configuration
    // failure that would hit every remaining sale identically.
    issueMock.mockImplementation(async () => {
      await prisma.fiscalisationProviderConfig.update({
        where: { id: providerConfigId },
        data: { certificateRef: null },
      });
      return connectorSuccess();
    });

    const results = await fiscaliseRetailSales({
      companyId,
      saleIds: sales.map((sale) => sale.id),
    });

    expect(results[0].fiscalStatus).toBe("SUCCESS");
    expect(results[1].fiscalStatus).toBe("FAILED");
    expect(results[1].errorCode).toBe("FISCAL_DEVICE_KEY_MISSING");
    expect(results[1].blocksDevice).toBe(true);
    // The third sale is never attempted: nothing may be signed onto a chain
    // already known to be broken.
    expect(results[2].fiscalStatus).toBe("SKIPPED");
    expect(results[2].fiscalError).toContain("Fiscalisation stopped at sale");
    expect(issueMock).toHaveBeenCalledTimes(1);

    const receipts = await receiptsInChainOrder();
    expect(receipts).toHaveLength(1);
    const day = await prisma.fiscalDay.findFirstOrThrow({ where: { companyId } });
    // One number reserved, not three: the halted sales burned nothing.
    expect(day.lastReceiptGlobalNo).toBe(1);
  });

  it("reports every sale as skipped when the device was never usable", async () => {
    const sales = [await standardSale(), await standardSale()];

    const results = await fiscaliseRetailSales({
      companyId,
      saleIds: sales.map((sale) => sale.id),
    });

    expect(results[0].errorCode).toBe("FISCAL_DAY_NOT_OPEN");
    expect(results[1].fiscalStatus).toBe("SKIPPED");
    expect(issueMock).not.toHaveBeenCalled();
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);
  });

  it("lets a refund in the same batch cite the sale it reverses", async () => {
    // The whole reason the sync route drains after the loop rather than inline:
    // the credit note needs the original's fiscal receipt, which exists only
    // once the original has been through the drain.
    await openDay();
    const original = await standardSale();
    const refund = await makeSale({
      saleType: "REFUND",
      sourceSaleId: original.id,
      totalAmount: -115,
      taxAmount: -15,
      lines: [{ productId: itemVat15, taxAmount: -15, lineTotal: -115 }],
    });

    const results = await fiscaliseRetailSales({
      companyId,
      saleIds: [original.id, refund.id],
    });

    expect(results.map((result) => result.fiscalStatus)).toEqual(["SUCCESS", "SUCCESS"]);
    const receipts = await receiptsInChainOrder();
    expect(receipts.map((receipt) => receipt.receiptType)).toEqual([
      "FISCALINVOICE",
      "CREDITNOTE",
    ]);
    expect(wireAt(1)?.creditDebitNote).toMatchObject({
      receiptGlobalNo: 1,
      originalSaleNo: original.saleNo,
    });
  });

  it("tells ZIMRA nothing about a sale the same batch went on to void", async () => {
    await openDay();
    const original = await standardSale();
    // What `voidRetailSaleTransaction` leaves behind: the sale is VOIDED and a
    // reversal row stands beside it.
    await prisma.retailSale.update({ where: { id: original.id }, data: { status: "VOIDED" } });
    const reversal = await makeSale({
      saleType: "VOID",
      sourceSaleId: original.id,
      totalAmount: -115,
      taxAmount: -15,
      lines: [{ productId: itemVat15, taxAmount: -15, lineTotal: -115 }],
    });

    const results = await fiscaliseRetailSales({
      companyId,
      saleIds: [original.id, reversal.id],
    });

    // Neither reaches ZIMRA: they never saw the sale, so there is nothing to
    // credit, and the day's counters stay clean.
    expect(results.map((result) => result.fiscalStatus)).toEqual(["SKIPPED", "SKIPPED"]);
    expect(issueMock).not.toHaveBeenCalled();
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);
  });

  it("returns one outcome per sale, in the order it was given them", async () => {
    await openDay();
    const sales = [await standardSale(), await standardSale(), await standardSale()];

    const results = await fiscaliseRetailSales({
      companyId,
      saleIds: sales.map((sale) => sale.id),
    });

    // The sync route zips these back onto its operation results by position.
    expect(results.map((result) => result.saleId)).toEqual(sales.map((sale) => sale.id));
  });
});
