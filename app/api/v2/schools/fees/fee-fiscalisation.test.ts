/**
 * S-2.7 — a school on the ZIMRA add-on fiscalises the money it takes.
 *
 * Three kinds of test live here.
 *
 *   **Route tests** drive the real receipt handler against a real Postgres with
 *   only the session mocked, and against a **real FDMS server** — a throwaway
 *   `node:http` listener the provider config points at. Nothing about the
 *   connector is stubbed, so the mTLS-less http path, the `Idempotency-Key`
 *   header and the response parsing are all genuinely exercised. That is what
 *   makes "a receipt fiscalises" mean something.
 *
 *   **The off case**, which matters just as much: a school without the add-on
 *   must receipt exactly as it always did. Asserted by the absence of an HTTP
 *   request, the absence of a `FiscalReceipt` row, and a receipt whose amounts
 *   are untouched.
 *
 *   **Migration witnesses**, inserting past the service layer, for the two
 *   things the database now guarantees: one fiscal receipt per school receipt,
 *   and a fiscal receipt naming exactly one source document.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { grantBundleToCompany } from "@/lib/platform/entitlements";

const { validateSessionMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
}));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { POST: postReceipt } = await import("./receipts/route");
const { GET: getFiscal, POST: postFiscal } = await import(
  "./receipts/[id]/fiscalise/route"
);
const { buildSchoolFeeReceiptPayload, resolveFiscalCustomer } = await import(
  "@/lib/schools/fiscalisation"
);
const { POST: replayFiscal } = await import(
  "@/app/api/accounting/fiscalisation/replay/route"
);

let companyId: string;
let actorId: string;
let termId: string;
let studentId: string;
let guardianId: string;
let feeStructureId: string;
let boardingStructureId: string;
let fiscalFeatureId: string;
let stamp: number;

/** Every request the fake FDMS endpoint saw, in order. */
type SeenRequest = { path: string; idempotencyKey: string | null; body: unknown };
let seen: SeenRequest[] = [];
let respondWith: { statusCode: number; body: unknown } = {
  statusCode: 200,
  body: { status: "SUCCESS", fiscalNumber: "FDMS-0001", reference: "REF-0001" },
};
let server: Server;

function post(url: string, body: unknown) {
  return new NextRequest(`http://school.test${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Flip the add-on on or off for this school. */
async function setFiscalisation(enabled: boolean) {
  await prisma.companyFeatureFlag.updateMany({
    where: { companyId, featureId: fiscalFeatureId },
    data: { isEnabled: enabled },
  });
}

/**
 * An issued invoice for `total`, of which `tax` is VAT.
 *
 * S-2.4's partial unique index means one live invoice per student, term and fee
 * structure, so a test wanting two invoices at once has to name the second
 * structure — which is exactly the boarding-beside-tuition case the index was
 * shaped for.
 */
async function makeInvoice(input: {
  total: number;
  tax?: number;
  no?: string;
  structureId?: string;
}) {
  const tax = input.tax ?? 0;
  const invoice = await prisma.schoolFeeInvoice.create({
    data: {
      companyId,
      invoiceNo: input.no ?? `INV-${stamp}-${Math.random().toString(36).slice(2, 10)}`,
      studentId,
      termId,
      feeStructureId: input.structureId ?? feeStructureId,
      issueDate: new Date("2026-05-01T00:00:00.000Z"),
      dueDate: new Date("2026-05-31T00:00:00.000Z"),
      status: "ISSUED",
      lines: {
        create: {
          companyId,
          feeCode: "TUITION",
          description: "Tuition",
          quantity: new Prisma.Decimal(1),
          unitAmount: new Prisma.Decimal(input.total),
          taxAmount: new Prisma.Decimal(tax),
          lineTotal: new Prisma.Decimal(input.total),
        },
      },
    },
    select: { id: true },
  });

  const { refreshFeeInvoiceBalance } = await import("./_helpers");
  await prisma.$transaction((tx) =>
    refreshFeeInvoiceBalance(tx, { companyId, invoiceId: invoice.id }),
  );
  return invoice.id;
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      seen.push({
        path: req.url ?? "",
        idempotencyKey:
          (req.headers["idempotency-key"] as string | undefined) ?? null,
        body: raw ? JSON.parse(raw) : null,
      });
      res.writeHead(respondWith.statusCode, { "content-type": "application/json" });
      res.end(JSON.stringify(respondWith.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const company = await prisma.company.create({
    data: { name: `Fiscal School ${stamp}`, slug: `fiscal-school-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `bursar-${stamp}@fiscal-school.test`,
      name: "Bursar",
      role: "BURSAR",
    },
    select: { id: true },
  });
  actorId = actor.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `FS${stamp}`,
      name: "2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    },
    select: { id: true },
  });

  const term = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: year.id,
      code: "T2",
      name: "Term 2",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-08-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  termId = term.id;

  const schoolClass = await prisma.schoolClass.create({
    data: { companyId, code: "F1", name: "Form 1", level: 1 },
    select: { id: true },
  });

  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `FS${stamp}`,
      firstName: "Rudo",
      lastName: "Moyo",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  studentId = student.id;

  // Two guardians on purpose: the fiscal customer is the one who pays, and the
  // resolver has to pick him out of the pair.
  const [payer, other] = await Promise.all([
    prisma.schoolGuardian.create({
      data: {
        companyId,
        guardianNo: `G${stamp}A`,
        firstName: "Farai",
        lastName: "Moyo",
        phone: "+263771000001",
        email: "farai@example.test",
        address: "12 Samora Machel Ave, Harare",
        nationalId: "63-1234567X63",
      },
      select: { id: true },
    }),
    prisma.schoolGuardian.create({
      data: {
        companyId,
        guardianNo: `G${stamp}B`,
        firstName: "Nyasha",
        lastName: "Moyo",
        phone: "+263771000002",
        address: "12 Samora Machel Ave, Harare",
      },
      select: { id: true },
    }),
  ]);
  guardianId = payer.id;

  await prisma.schoolStudentGuardian.createMany({
    data: [
      {
        companyId,
        studentId,
        guardianId: other.id,
        relationship: "Aunt",
        isPrimary: false,
        canReceiveFinancials: false,
      },
      {
        companyId,
        studentId,
        guardianId: payer.id,
        relationship: "Father",
        isPrimary: true,
        canReceiveFinancials: true,
      },
    ],
  });

  const [tuition, boarding] = await Promise.all([
    prisma.schoolFeeStructure.create({
      data: { companyId, termId, classId: schoolClass.id, name: "Tuition", currency: "USD" },
      select: { id: true },
    }),
    prisma.schoolFeeStructure.create({
      data: { companyId, termId, classId: schoolClass.id, name: "Boarding", currency: "USD" },
      select: { id: true },
    }),
  ]);
  feeStructureId = tuition.id;
  boardingStructureId = boarding.id;

  // The school's own ZIMRA identity. A provisioned school gets the row and none
  // of these fields; a test that seeded them silently would never notice.
  await prisma.accountingSettings.upsert({
    where: { companyId },
    update: {},
    create: {
      companyId,
      baseCurrency: "USD",
      legalName: "Chikomo High School Trust",
      tradingName: "Chikomo High School",
      vatNumber: "220123456",
      taxNumber: "1000123456",
      address: "1 School Road, Marondera",
      phone: "+263242000000",
      email: "bursar@chikomo.test",
    },
  });

  await prisma.fiscalisationProviderConfig.create({
    data: {
      companyId,
      providerKey: "TEST_FDMS",
      apiBaseUrl,
      authType: "NONE",
      deviceId: "DEV-001",
      timeoutMs: 5000,
      isActive: true,
    },
  });

  await grantBundleToCompany({
    companyId,
    bundleCode: "ADDON_ZIMRA_FISCAL",
    reason: "S-2.7 test",
  });
  const feature = await prisma.platformFeature.findUniqueOrThrow({
    where: { key: "accounting.zimra.fiscalisation" },
    select: { id: true },
  });
  fiscalFeatureId = feature.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

beforeEach(async () => {
  validateSessionMock.mockReset();
  validateSessionMock.mockResolvedValue({
    session: { user: { id: actorId, companyId, role: "BURSAR" } },
  });
  seen = [];
  respondWith = {
    statusCode: 200,
    body: { status: "SUCCESS", fiscalNumber: "FDMS-0001", reference: "REF-0001" },
  };
  await setFiscalisation(true);
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.schoolFeeReceipt.deleteMany({ where: { companyId } });
  await prisma.schoolFeeInvoice.deleteMany({ where: { companyId } });
});

type ReceiptResponse = {
  id: string;
  receiptNo: string;
  amountReceived: number;
  amountUnallocated: number;
  fiscal: {
    fiscalStatus: string;
    fiscalReceiptId: string | null;
    fiscalNumber: string | null;
    providerReference: string | null;
    fiscalError: string | null;
  } | null;
};

async function receipt(input: {
  invoiceId?: string;
  amount: number;
  allocations?: Array<{ invoiceId: string; allocatedAmount: number }>;
}) {
  const response = await postReceipt(
    post("/api/v2/schools/fees/receipts", {
      studentId,
      receiptDate: "2026-05-15",
      paymentMethod: "CASH",
      amountReceived: input.amount,
      ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
      ...(input.allocations ? { allocations: input.allocations } : {}),
    }),
  );
  expect(response.status).toBe(201);
  return body<ReceiptResponse>(response);
}

describe("with the add-on on, a receipt fiscalises", () => {
  it("issues a fiscal receipt through the FDMS connector", async () => {
    const invoiceId = await makeInvoice({ total: 450 });
    const created = await receipt({ invoiceId, amount: 450 });

    expect(created.fiscal?.fiscalStatus).toBe("SUCCESS");
    expect(created.fiscal?.fiscalNumber).toBe("FDMS-0001");
    expect(created.fiscal?.providerReference).toBe("REF-0001");
    expect(created.fiscal?.fiscalError).toBeNull();

    // The connector really was called, once, at the default issue path.
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/receipts");
    expect(seen[0].idempotencyKey).toBe(
      `${companyId}:school-fee-receipt:${created.id}`,
    );

    const row = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { schoolReceiptId: created.id },
      select: {
        companyId: true,
        invoiceId: true,
        status: true,
        fiscalNumber: true,
        receiptNumber: true,
        attemptCount: true,
        lastError: true,
      },
    });
    expect(row.companyId).toBe(companyId);
    // The school row does not pretend to be a sales invoice.
    expect(row.invoiceId).toBeNull();
    expect(row.status).toBe("SUCCESS");
    expect(row.fiscalNumber).toBe("FDMS-0001");
    expect(row.receiptNumber).toBe(created.receiptNo);
    expect(row.attemptCount).toBe(1);
    expect(row.lastError).toBeNull();
  });

  it("sends the school as supplier and the fee-payer guardian as customer", async () => {
    const invoiceId = await makeInvoice({ total: 200 });
    await receipt({ invoiceId, amount: 200 });

    const sent = seen[0].body as {
      supplier: { legalName: string; vatNumber: string };
      customer: { name: string; address: string; taxNumber: string };
      student: { studentNo: string };
      deviceId: string;
    };
    expect(sent.supplier.legalName).toBe("Chikomo High School Trust");
    expect(sent.supplier.vatNumber).toBe("220123456");
    // Farai pays; Nyasha is on file but does not receive financials.
    expect(sent.customer.name).toBe("Farai Moyo");
    expect(sent.customer.address).toBe("12 Samora Machel Ave, Harare");
    expect(sent.customer.taxNumber).toBe("63-1234567X63");
    expect(sent.student.studentNo).toBe(`FS${stamp}`);
    expect(sent.deviceId).toBe("DEV-001");
  });

  it("derives lines from what the payment settled, and they sum to it", async () => {
    const first = await makeInvoice({ total: 300, no: `INV-${stamp}-A` });
    const second = await makeInvoice({
      total: 200,
      no: `INV-${stamp}-B`,
      structureId: boardingStructureId,
    });
    await receipt({
      amount: 500,
      allocations: [
        { invoiceId: first, allocatedAmount: 300 },
        { invoiceId: second, allocatedAmount: 200 },
      ],
    });

    const sent = seen[0].body as {
      totals: { subTotal: number; taxTotal: number; total: number };
      items: Array<{ description: string; lineTotal: number }>;
    };
    expect(sent.items).toHaveLength(2);
    expect(sent.items[0].description).toContain(`INV-${stamp}-A`);
    expect(sent.items[0].description).toContain("Term 2");
    expect(sent.items.reduce((sum, item) => sum + item.lineTotal, 0)).toBe(500);
    expect(sent.totals.total).toBe(500);
    expect(sent.totals.subTotal + sent.totals.taxTotal).toBe(500);
  });

  it("apportions the invoice's VAT across a part payment", async () => {
    // A 115.00 bill of which 15.00 is VAT, half of it paid.
    const invoiceId = await makeInvoice({ total: 115, tax: 15 });
    await receipt({ invoiceId, amount: 57.5 });

    const sent = seen[0].body as {
      totals: { subTotal: number; taxTotal: number; total: number };
      items: Array<{ taxAmount: number; taxRate: number; lineTotal: number }>;
    };
    expect(sent.items[0].lineTotal).toBe(57.5);
    expect(sent.items[0].taxAmount).toBe(7.5);
    // 7.50 on a net of 50.00 — the invoice's own 15%.
    expect(sent.items[0].taxRate).toBe(15);
    expect(sent.totals.taxTotal).toBe(7.5);
    expect(sent.totals.subTotal).toBe(50);
  });

  it("carries an overpayment as an untaxed payment-on-account line", async () => {
    const invoiceId = await makeInvoice({ total: 450 });
    const created = await receipt({ invoiceId, amount: 500 });
    expect(created.amountUnallocated).toBe(50);

    const sent = seen[0].body as {
      totals: { total: number; taxTotal: number };
      items: Array<{ description: string; taxAmount: number; lineTotal: number }>;
    };
    expect(sent.items).toHaveLength(2);
    expect(sent.items[1].description).toContain("Payment on account");
    expect(sent.items[1].lineTotal).toBe(50);
    // No supply has been made against the credit, so no output VAT on it.
    expect(sent.items[1].taxAmount).toBe(0);
    expect(sent.totals.total).toBe(500);
  });

  it("does not re-send a receipt FDMS has already accepted", async () => {
    const invoiceId = await makeInvoice({ total: 450 });
    const created = await receipt({ invoiceId, amount: 450 });
    expect(seen).toHaveLength(1);

    const again = await postFiscal(
      post(`/api/v2/schools/fees/receipts/${created.id}/fiscalise`, {}),
      params(created.id),
    );
    expect(again.status).toBe(200);
    const payload = await body<{ fiscalStatus: string; fiscalNumber: string }>(again);
    expect(payload.fiscalStatus).toBe("SUCCESS");
    expect(payload.fiscalNumber).toBe("FDMS-0001");

    // Nothing left the process the second time, and there is still one row.
    expect(seen).toHaveLength(1);
    expect(
      await prisma.fiscalReceipt.count({ where: { schoolReceiptId: created.id } }),
    ).toBe(1);
  });
});

describe("with the add-on off, receipting is untouched", () => {
  beforeEach(async () => {
    await setFiscalisation(false);
  });

  it("takes the payment, calls nothing and queues nothing", async () => {
    const invoiceId = await makeInvoice({ total: 450 });
    const created = await receipt({ invoiceId, amount: 500 });

    // The money is exactly where it would have been before S-2.7.
    expect(created.amountReceived).toBe(500);
    expect(created.amountUnallocated).toBe(50);

    expect(created.fiscal?.fiscalStatus).toBe("SKIPPED");
    expect(created.fiscal?.fiscalReceiptId).toBeNull();
    expect(created.fiscal?.fiscalError).toBe(
      "Fiscalisation is not enabled for this school",
    );

    expect(seen).toHaveLength(0);
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);

    const stored = await prisma.schoolFeeInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { status: true, paidAmount: true, balanceAmount: true },
    });
    expect(stored.status).toBe("PAID");
    expect(Number(stored.paidAmount)).toBe(450);
    expect(Number(stored.balanceAmount)).toBe(0);
  });

  it("refuses a manual fiscalisation rather than half-doing one", async () => {
    const invoiceId = await makeInvoice({ total: 100 });
    const created = await receipt({ invoiceId, amount: 100 });

    const response = await postFiscal(
      post(`/api/v2/schools/fees/receipts/${created.id}/fiscalise`, {}),
      params(created.id),
    );
    expect(response.status).toBe(403);
    expect(seen).toHaveLength(0);
  });
});

describe("a fiscalisation failure never costs the school the payment", () => {
  it("keeps the receipt and leaves a retryable row when FDMS rejects it", async () => {
    respondWith = { statusCode: 500, body: { status: "FAILED", error: "FDMS down" } };
    const invoiceId = await makeInvoice({ total: 450 });
    const created = await receipt({ invoiceId, amount: 450 });

    // The payment stands.
    expect(created.amountReceived).toBe(450);
    expect(created.fiscal?.fiscalStatus).toBe("FAILED");
    expect(created.fiscal?.fiscalError).toBe("FDMS down");

    const stored = await prisma.schoolFeeReceipt.findUniqueOrThrow({
      where: { id: created.id },
      select: { status: true, amountReceived: true, amountAllocated: true },
    });
    expect(stored.status).toBe("POSTED");
    expect(Number(stored.amountReceived)).toBe(450);
    expect(Number(stored.amountAllocated)).toBe(450);

    const row = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { schoolReceiptId: created.id },
      select: { status: true, attemptCount: true, nextRetryAt: true, lastError: true },
    });
    expect(row.status).toBe("FAILED");
    expect(row.attemptCount).toBe(1);
    // The backoff is what makes replay pick it up rather than hammer it.
    expect(row.nextRetryAt).toBeInstanceOf(Date);
    expect(row.lastError).toBe("FDMS down");

    // And a retry, once FDMS is back, lands on the same row.
    respondWith = {
      statusCode: 200,
      body: { status: "SUCCESS", fiscalNumber: "FDMS-0002" },
    };
    const retry = await postFiscal(
      post(`/api/v2/schools/fees/receipts/${created.id}/fiscalise`, {}),
      params(created.id),
    );
    expect(retry.status).toBe(200);
    expect(seen).toHaveLength(2);
    const after = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { schoolReceiptId: created.id },
      select: { status: true, attemptCount: true, fiscalNumber: true },
    });
    expect(after.status).toBe("SUCCESS");
    expect(after.attemptCount).toBe(2);
    expect(after.fiscalNumber).toBe("FDMS-0002");
  });

  it("survives the connector throwing, without sending the bursar a 500", async () => {
    // No provider reachable: the socket is refused, which is a thrown error
    // rather than an HTTP status.
    await prisma.fiscalisationProviderConfig.updateMany({
      where: { companyId },
      data: { apiBaseUrl: "http://127.0.0.1:1" },
    });

    const invoiceId = await makeInvoice({ total: 120 });
    const created = await receipt({ invoiceId, amount: 120 });
    expect(created.fiscal?.fiscalStatus).toBe("FAILED");
    expect(created.fiscal?.fiscalError).toBeTruthy();

    const stored = await prisma.schoolFeeReceipt.findUniqueOrThrow({
      where: { id: created.id },
      select: { status: true },
    });
    expect(stored.status).toBe("POSTED");

    const port = (server.address() as AddressInfo).port;
    await prisma.fiscalisationProviderConfig.updateMany({
      where: { companyId },
      data: { apiBaseUrl: `http://127.0.0.1:${port}` },
    });
  });

  it("tells a bursar which fields are missing rather than sending a bad document", async () => {
    await prisma.accountingSettings.update({
      where: { companyId },
      data: { vatNumber: null, taxNumber: null },
    });

    const invoiceId = await makeInvoice({ total: 90 });
    const created = await receipt({ invoiceId, amount: 90 });

    expect(created.fiscal?.fiscalStatus).toBe("FAILED");
    expect(created.fiscal?.fiscalError).toContain("supplier VAT number");
    expect(created.fiscal?.fiscalError).toContain("supplier tax number");
    // Nothing was sent and nothing was recorded as attempted.
    expect(seen).toHaveLength(0);
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);

    const status = await getFiscal(
      post(`/api/v2/schools/fees/receipts/${created.id}/fiscalise`, {}),
      params(created.id),
    );
    const payload = await body<{ ready: boolean; missing: string[] }>(status);
    expect(payload.ready).toBe(false);
    expect(payload.missing).toContain("supplier VAT number");

    await prisma.accountingSettings.update({
      where: { companyId },
      data: { vatNumber: "220123456", taxNumber: "1000123456" },
    });
  });
});

describe("replay drains what did not land", () => {
  /** Replay is a SUPERADMIN/MANAGER action, not a bursar's. */
  async function replay() {
    validateSessionMock.mockResolvedValue({
      session: { user: { id: actorId, companyId, role: "SUPERADMIN" } },
    });
    const response = await replayFiscal(
      post("/api/accounting/fiscalisation/replay", { limit: 20 }),
    );
    expect(response.status).toBe(200);
    return body<{
      processed: number;
      queued: number;
      failed: number;
      skipped: number;
      deferred: number;
    }>(response);
  }

  it("re-issues a failed school receipt, which the old invoiceId filter excluded", async () => {
    respondWith = { statusCode: 500, body: { status: "FAILED", error: "FDMS down" } };
    const invoiceId = await makeInvoice({ total: 450 });
    const created = await receipt({ invoiceId, amount: 450 });
    expect(created.fiscal?.fiscalStatus).toBe("FAILED");

    // The backoff would ordinarily hold it back; replay is meant to be run
    // after the outage, so bring the retry time forward rather than sleeping.
    await prisma.fiscalReceipt.updateMany({
      where: { schoolReceiptId: created.id },
      data: { nextRetryAt: new Date(Date.now() - 1000) },
    });

    respondWith = {
      statusCode: 200,
      body: { status: "SUCCESS", fiscalNumber: "FDMS-REPLAY" },
    };
    const result = await replay();
    expect(result.processed).toBe(1);
    expect(result.queued).toBe(1);
    expect(result.failed).toBe(0);

    const row = await prisma.fiscalReceipt.findUniqueOrThrow({
      where: { schoolReceiptId: created.id },
      select: { status: true, fiscalNumber: true },
    });
    expect(row.status).toBe("SUCCESS");
    expect(row.fiscalNumber).toBe("FDMS-REPLAY");
  });

  it("sweeps a posted receipt that was never attempted at all", async () => {
    const invoiceId = await makeInvoice({ total: 250 });
    const created = await receipt({ invoiceId, amount: 250 });
    // Stand in for the crash between the receipt committing and the fiscal row
    // being written — the gap the "receipt first, fiscalise after" ordering
    // deliberately leaves open.
    await prisma.fiscalReceipt.deleteMany({ where: { schoolReceiptId: created.id } });
    seen = [];

    const result = await replay();
    expect(result.processed).toBe(1);
    expect(result.queued).toBe(1);
    expect(seen).toHaveLength(1);
    expect(
      await prisma.fiscalReceipt.count({ where: { schoolReceiptId: created.id } }),
    ).toBe(1);
  });

  it("leaves a school without the add-on entirely alone", async () => {
    const invoiceId = await makeInvoice({ total: 250 });
    await receipt({ invoiceId, amount: 250 });
    await setFiscalisation(false);
    await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
    seen = [];

    const result = await replay();
    expect(result.processed).toBe(0);
    expect(seen).toHaveLength(0);
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);
  });

  /**
   * FD-0.4a widened `FiscalReceipt` from two source documents to four, and the
   * drainer only knows how to re-issue two of them. The failure this pins is a
   * silent one: a credit-note row falling into the catch-all branch would be
   * reported as a failure with no error and no attempt, so an operator watching
   * the replay count would see a number that never goes down and no cause for
   * it anywhere. It is named `deferred` instead — nothing is wrong with the
   * row, there is simply no issuer for it until FD-4.1.
   */
  it("names a source it cannot re-issue yet rather than reporting it as a failure", async () => {
    const customer = await prisma.customer.create({
      data: { companyId, name: `Payer ${stamp}-cn` },
      select: { id: true },
    });
    const salesInvoice = await prisma.salesInvoice.create({
      data: {
        companyId,
        customerId: customer.id,
        invoiceNumber: `SI-${stamp}-CN`,
        invoiceDate: new Date("2026-05-15T00:00:00.000Z"),
        dueDate: new Date("2026-06-15T00:00:00.000Z"),
      },
      select: { id: true },
    });
    const creditNote = await prisma.creditNote.create({
      data: {
        companyId,
        invoiceId: salesInvoice.id,
        noteNumber: `CN-${stamp}`,
        noteDate: new Date("2026-05-20T00:00:00.000Z"),
      },
      select: { id: true },
    });

    // Inserted past the service layer, because no service writes one yet —
    // which is the whole point of the branch under test.
    await prisma.fiscalReceipt.create({
      data: {
        companyId,
        creditNoteId: creditNote.id,
        status: "FAILED",
        nextRetryAt: new Date(Date.now() - 1000),
      },
    });

    const result = await replay();

    expect(result.processed).toBe(1);
    expect(result.deferred).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.queued).toBe(0);
    // Nothing was sent: a deferred row is not a half-made attempt.
    expect(seen).toHaveLength(0);

    await prisma.creditNote.delete({ where: { id: creditNote.id } });
    await prisma.salesInvoice.delete({ where: { id: salesInvoice.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });
});

describe("the customer resolver", () => {
  it("falls back to the student when no guardian is on file", () => {
    const customer = resolveFiscalCustomer({
      student: {
        studentNo: "S001",
        firstName: "Rudo",
        lastName: "Moyo",
        guardianLinks: [],
      },
      // The resolver reads nothing else off the receipt.
    } as unknown as Parameters<typeof resolveFiscalCustomer>[0]);

    expect(customer.name).toBe("Rudo Moyo");
    // Which is exactly why validation then refuses: a student has no billing
    // address, and a fiscal receipt without one is not a fiscal receipt.
    expect(customer.address).toBeNull();
  });

  it("builds a payload whose parts add up even with no allocations at all", () => {
    const payload = buildSchoolFeeReceiptPayload({
      receipt: {
        receiptNo: "RCT-1",
        receiptDate: new Date("2026-05-15T00:00:00.000Z"),
        currency: "USD",
        paymentMethod: "CASH",
        reference: null,
        amountReceived: new Prisma.Decimal("75.00"),
        amountUnallocated: new Prisma.Decimal("75.00"),
        allocations: [],
        student: {
          studentNo: "S001",
          firstName: "Rudo",
          lastName: "Moyo",
          guardianLinks: [],
        },
      } as unknown as Parameters<typeof buildSchoolFeeReceiptPayload>[0]["receipt"],
      supplier: null,
    });

    expect(payload.totals.total).toBe(75);
    expect(payload.totals.taxTotal).toBe(0);
    expect(payload.totals.subTotal).toBe(75);
    expect(payload.items).toHaveLength(1);
  });
});

describe("migration witnesses — the database is the last word", () => {
  it("refuses a second fiscal receipt for one school receipt", async () => {
    const invoiceId = await makeInvoice({ total: 450 });
    const created = await receipt({ invoiceId, amount: 450 });
    expect(guardianId).toBeTruthy();

    await expect(
      prisma.$executeRaw`
        INSERT INTO "FiscalReceipt" ("id", "companyId", "schoolReceiptId", "status", "updatedAt")
        VALUES (gen_random_uuid(), ${companyId}, ${created.id}, 'PENDING', now())
      `,
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it("refuses a fiscal receipt that names no source document", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "FiscalReceipt" ("id", "companyId", "status", "updatedAt")
        VALUES (gen_random_uuid(), ${companyId}, 'PENDING', now())
      `,
    ).rejects.toThrow(/FiscalReceipt_one_source_check/);
  });

  it("refuses a fiscal receipt that claims to be two documents at once", async () => {
    const invoiceId = await makeInvoice({ total: 450 });
    const created = await receipt({ invoiceId, amount: 450 });

    const customer = await prisma.customer.create({
      data: { companyId, name: `Payer ${stamp}` },
      select: { id: true },
    });
    const salesInvoice = await prisma.salesInvoice.create({
      data: {
        companyId,
        customerId: customer.id,
        invoiceNumber: `SI-${stamp}`,
        invoiceDate: new Date("2026-05-15T00:00:00.000Z"),
        dueDate: new Date("2026-06-15T00:00:00.000Z"),
      },
      select: { id: true },
    });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "FiscalReceipt" ("id", "companyId", "invoiceId", "schoolReceiptId", "status", "updatedAt")
        VALUES (gen_random_uuid(), ${companyId}, ${salesInvoice.id}, ${created.id}, 'PENDING', now())
      `,
    ).rejects.toThrow(/FiscalReceipt_one_source_check/);
  });
});
