/**
 * S-2.5 and S-2.6 — an overpayment becomes a credit, and a credit can be given
 * back.
 *
 * Two kinds of test live here and they are doing different jobs.
 *
 *   **Route tests** drive the real handlers against a real Postgres, with only
 *   the session mocked. They are what proves the promise a bursar was made:
 *   pay $500 against a $450 bill and the school knows about the $50; spend it
 *   on next term's invoice; ask for it back.
 *
 *   **Migration witnesses** insert and update *past* the service layer, so the
 *   only thing that can refuse them is the database. Everything the story
 *   describes as an invariant — the receipt's parts adding up to its whole, a
 *   refund never exceeding the credit behind it, an invoice never owing and
 *   being owed at once — is asserted that way, because a check in a handler
 *   produces a good sentence and a constraint is what survives two bursars at
 *   two desks.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";

const { validateSessionMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
}));

vi.mock("@corelithzw/platform/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@corelithzw/platform/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { POST: postReceipt } = await import("./receipts/route");
const { POST: allocateCredit } = await import("./receipts/[id]/allocate/route");
const { GET: getCredits } = await import("./credits/route");
const { POST: requestRefund, GET: listRefunds } = await import(
  "../finance/refunds/route"
);
const { POST: payRefund } = await import("../finance/refunds/[id]/pay/route");
const { POST: cancelRefund } = await import("../finance/refunds/[id]/cancel/route");
const { POST: voidReceipt } = await import("./receipts/[id]/void/route");

let companyId: string;
let actorId: string;
let termId: string;
let classId: string;
let studentId: string;
let feeStructureId: string;
let otherFeeStructureId: string;
let stamp: number;

function post(url: string, body: unknown) {
  return new NextRequest(`http://school.test${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function get(url: string) {
  return new NextRequest(`http://school.test${url}`);
}

/** An issued invoice for `total`, built through the same path the routes use. */
async function makeInvoice(total: number, structure = feeStructureId) {
  const invoice = await prisma.schoolFeeInvoice.create({
    data: {
      companyId,
      invoiceNo: `INV-${stamp}-${Math.random().toString(36).slice(2, 10)}`,
      studentId,
      termId,
      feeStructureId: structure,
      issueDate: new Date("2026-05-01T00:00:00.000Z"),
      dueDate: new Date("2026-05-31T00:00:00.000Z"),
      status: "ISSUED",
      lines: {
        create: {
          companyId,
          feeCode: "TUITION",
          description: "Tuition",
          quantity: new Prisma.Decimal(1),
          unitAmount: new Prisma.Decimal(total),
          lineTotal: new Prisma.Decimal(total),
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

async function readInvoice(id: string) {
  return prisma.schoolFeeInvoice.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      creditAmount: true,
      refundedAmount: true,
    },
  });
}

async function readReceipt(id: string) {
  return prisma.schoolFeeReceipt.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      amountReceived: true,
      amountAllocated: true,
      amountUnallocated: true,
      refundedAmount: true,
    },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Credit School ${stamp}`, slug: `credit-school-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `bursar-${stamp}@credit-school.test`,
      name: "Bursar",
      role: "BURSAR",
    },
    select: { id: true },
  });
  actorId = actor.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `CR${stamp}`,
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
  classId = schoolClass.id;

  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `CR${stamp}`,
      firstName: "Tendai",
      lastName: "Chirwa",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  studentId = student.id;

  const [tuition, boarding] = await Promise.all([
    prisma.schoolFeeStructure.create({
      data: { companyId, termId, classId, name: "Tuition", currency: "USD" },
      select: { id: true },
    }),
    prisma.schoolFeeStructure.create({
      data: { companyId, termId, classId, name: "Boarding", currency: "USD" },
      select: { id: true },
    }),
  ]);
  feeStructureId = tuition.id;
  otherFeeStructureId = boarding.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  validateSessionMock.mockReset();
  validateSessionMock.mockResolvedValue({
    session: { user: { id: actorId, companyId, role: "BURSAR" } },
  });
  await prisma.schoolFeeRefund.deleteMany({ where: { companyId } });
  await prisma.schoolFeeReceipt.deleteMany({ where: { companyId } });
  await prisma.schoolFeeWaiver.deleteMany({ where: { companyId } });
  await prisma.schoolFeeInvoice.deleteMany({ where: { companyId } });
});

// =============================================================================
// S-2.5 — the overpayment
// =============================================================================

describe("S-2.5 — an overpayment becomes a credit", () => {
  it("takes $500 against a $450 bill, settles the bill and carries the $50", async () => {
    const invoiceId = await makeInvoice(450);

    const response = await postReceipt(
      post("/api/v2/schools/fees/receipts", {
        invoiceId,
        amount: 500,
        method: "CASH",
      }),
    );
    // The whole point. Before S-2.5 this was a 400 — "allocation exceeds
    // invoice outstanding balance" — and the parent's money could not be
    // recorded at all.
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(Number(body.amountReceived)).toBe(500);
    expect(Number(body.amountAllocated)).toBe(450);
    expect(Number(body.amountUnallocated)).toBe(50);

    const invoice = await readInvoice(invoiceId);
    expect(invoice.status).toBe("PAID");
    expect(invoice.balanceAmount.toFixed(2)).toBe("0.00");
    expect(invoice.paidAmount.toFixed(2)).toBe("450.00");
  });

  it("carries the whole payment as credit when there is nothing outstanding", async () => {
    const invoiceId = await makeInvoice(100);
    await postReceipt(
      post("/api/v2/schools/fees/receipts", { invoiceId, amount: 100, method: "CASH" }),
    );

    const second = await postReceipt(
      post("/api/v2/schools/fees/receipts", { invoiceId, amount: 75, method: "CASH" }),
    );
    expect(second.status).toBe(201);
    const body = await second.json();
    expect(Number(body.amountAllocated)).toBe(0);
    expect(Number(body.amountUnallocated)).toBe(75);
    expect(body.allocations).toHaveLength(0);
  });

  it("settles part of a bill and leaves the rest outstanding", async () => {
    const invoiceId = await makeInvoice(450);

    const response = await postReceipt(
      post("/api/v2/schools/fees/receipts", { invoiceId, amount: 200, method: "CASH" }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(Number(body.amountAllocated)).toBe(200);
    expect(Number(body.amountUnallocated)).toBe(0);

    const invoice = await readInvoice(invoiceId);
    expect(invoice.status).toBe("PART_PAID");
    expect(invoice.balanceAmount.toFixed(2)).toBe("250.00");
    // A part payment is not a credit. Nothing is owed back.
    expect(invoice.creditAmount.toFixed(2)).toBe("0.00");
  });

  it("still refuses a named allocation larger than the invoice it names", async () => {
    const invoiceId = await makeInvoice(450);

    // Naming both the invoice and the amount is a different claim from handing
    // over a payment: one of the two numbers is simply wrong, and guessing
    // which would be worse than saying so.
    const response = await postReceipt(
      post("/api/v2/schools/fees/receipts", {
        studentId,
        receiptDate: "2026-05-10",
        paymentMethod: "CASH",
        amountReceived: 500,
        allocations: [{ invoiceId, allocatedAmount: 500 }],
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/outstanding balance/i);
  });

  it("refuses allocations that add up to more than was handed over", async () => {
    const first = await makeInvoice(100);
    const second = await makeInvoice(100, otherFeeStructureId);

    const response = await postReceipt(
      post("/api/v2/schools/fees/receipts", {
        studentId,
        receiptDate: "2026-05-10",
        paymentMethod: "CASH",
        amountReceived: 150,
        allocations: [
          { invoiceId: first, allocatedAmount: 100 },
          { invoiceId: second, allocatedAmount: 100 },
        ],
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/exceeds amount received/i);
  });

  it("shows the credit on the credits surface, whose money the school knows it is", async () => {
    const invoiceId = await makeInvoice(450);
    await postReceipt(
      post("/api/v2/schools/fees/receipts", { invoiceId, amount: 500, method: "CASH" }),
    );

    const response = await getCredits(get("/api/v2/schools/fees/credits"));
    expect(response.status).toBe(200);
    const body = await response.json();
    const credits = body.data as Array<Record<string, unknown>>;
    expect(credits).toHaveLength(1);
    expect(credits[0].kind).toBe("RECEIPT");
    expect(credits[0].available).toBe(50);
    expect(credits[0].heldForRefund).toBe(0);
    expect((credits[0].student as { studentNo: string }).studentNo).toBe(`CR${stamp}`);
  });

  it("carries an over-settled invoice as credit instead of clamping it away", async () => {
    const invoiceId = await makeInvoice(450);
    await postReceipt(
      post("/api/v2/schools/fees/receipts", { invoiceId, amount: 450, method: "CASH" }),
    );

    // The bursary arrives after the family has already paid in full. Before
    // S-2.5 the clamp on `balanceAmount` swallowed this $50 and nothing
    // anywhere held it.
    await prisma.schoolFeeWaiver.create({
      data: {
        companyId,
        studentId,
        termId,
        invoiceId,
        waiverType: "SCHOLARSHIP",
        amount: new Prisma.Decimal(50),
        status: "APPLIED",
      },
    });
    const { refreshFeeInvoiceBalance } = await import("./_helpers");
    await prisma.$transaction((tx) =>
      refreshFeeInvoiceBalance(tx, { companyId, invoiceId }),
    );

    const invoice = await readInvoice(invoiceId);
    expect(invoice.balanceAmount.toFixed(2)).toBe("0.00");
    expect(invoice.creditAmount.toFixed(2)).toBe("50.00");
  });
});

describe("S-2.5 — spending a credit on the next bill", () => {
  async function overpay() {
    const firstInvoice = await makeInvoice(450);
    const response = await postReceipt(
      post("/api/v2/schools/fees/receipts", {
        invoiceId: firstInvoice,
        amount: 500,
        method: "CASH",
      }),
    );
    const receipt = await response.json();
    return { firstInvoice, receiptId: receipt.id as string };
  }

  it("allocates the credit forward to a later invoice", async () => {
    const { receiptId } = await overpay();
    const nextInvoice = await makeInvoice(300, otherFeeStructureId);

    const response = await allocateCredit(
      post(`/api/v2/schools/fees/receipts/${receiptId}/allocate`, {
        allocations: [{ invoiceId: nextInvoice }],
      }),
      { params: Promise.resolve({ id: receiptId }) },
    );
    expect(response.status).toBe(200);

    const receipt = await readReceipt(receiptId);
    expect(receipt.amountAllocated.toFixed(2)).toBe("500.00");
    expect(receipt.amountUnallocated.toFixed(2)).toBe("0.00");

    const invoice = await readInvoice(nextInvoice);
    expect(invoice.paidAmount.toFixed(2)).toBe("50.00");
    expect(invoice.balanceAmount.toFixed(2)).toBe("250.00");
    expect(invoice.status).toBe("PART_PAID");
  });

  it("allocates a named part of the credit and keeps the rest", async () => {
    const { receiptId } = await overpay();
    const nextInvoice = await makeInvoice(300, otherFeeStructureId);

    const response = await allocateCredit(
      post(`/api/v2/schools/fees/receipts/${receiptId}/allocate`, {
        allocations: [{ invoiceId: nextInvoice, allocatedAmount: 20 }],
      }),
      { params: Promise.resolve({ id: receiptId }) },
    );
    expect(response.status).toBe(200);

    const receipt = await readReceipt(receiptId);
    expect(receipt.amountUnallocated.toFixed(2)).toBe("30.00");
    expect((await readInvoice(nextInvoice)).paidAmount.toFixed(2)).toBe("20.00");
  });

  it("refuses to allocate more credit than the receipt is holding", async () => {
    const { receiptId } = await overpay();
    const nextInvoice = await makeInvoice(300, otherFeeStructureId);

    const response = await allocateCredit(
      post(`/api/v2/schools/fees/receipts/${receiptId}/allocate`, {
        allocations: [{ invoiceId: nextInvoice, allocatedAmount: 80 }],
      }),
      { params: Promise.resolve({ id: receiptId }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/of credit/i);
    // And nothing moved.
    expect((await readReceipt(receiptId)).amountUnallocated.toFixed(2)).toBe("50.00");
  });

  it("refuses to allocate one family's credit to another family's bill", async () => {
    const { receiptId } = await overpay();
    const sibling = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `CR${stamp}X`,
        firstName: "Rudo",
        lastName: "Chirwa",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    const siblingInvoice = await prisma.schoolFeeInvoice.create({
      data: {
        companyId,
        invoiceNo: `INV-${stamp}-sib`,
        studentId: sibling.id,
        termId,
        feeStructureId: otherFeeStructureId,
        issueDate: new Date("2026-05-01T00:00:00.000Z"),
        dueDate: new Date("2026-05-31T00:00:00.000Z"),
        status: "ISSUED",
        totalAmount: new Prisma.Decimal(300),
        balanceAmount: new Prisma.Decimal(300),
      },
      select: { id: true },
    });

    const response = await allocateCredit(
      post(`/api/v2/schools/fees/receipts/${receiptId}/allocate`, {
        allocations: [{ invoiceId: siblingInvoice.id }],
      }),
      { params: Promise.resolve({ id: receiptId }) },
    );
    expect(response.status).toBe(400);
  });
});

// =============================================================================
// S-2.6 — the refund
// =============================================================================

describe("S-2.6 — a bursar can refund a parent", () => {
  async function creditOf(amount: number) {
    const invoiceId = await makeInvoice(450);
    const response = await postReceipt(
      post("/api/v2/schools/fees/receipts", {
        invoiceId,
        amount: 450 + amount,
        method: "CASH",
      }),
    );
    const receipt = await response.json();
    return receipt.id as string;
  }

  it("refunds exactly what is available", async () => {
    const receiptId = await creditOf(50);

    const response = await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        receiptId,
        amount: 50,
        method: "BANK_TRANSFER",
        reason: "Overpaid the term's tuition",
      }),
    );
    expect(response.status).toBe(201);
    const refund = await response.json();
    expect(refund.status).toBe("REQUESTED");
    expect(Number(refund.amount)).toBe(50);
    expect(refund.currency).toBe("USD");

    // The credit is held from the moment it is asked for, so it cannot also be
    // spent on next term's bill.
    const receipt = await readReceipt(receiptId);
    expect(receipt.refundedAmount.toFixed(2)).toBe("50.00");

    const credits = await (await getCredits(get("/api/v2/schools/fees/credits"))).json();
    expect(credits.data[0].available).toBe(0);
    expect(credits.data[0].heldForRefund).toBe(50);
  });

  it("refuses to refund more than is available", async () => {
    const receiptId = await creditOf(50);

    const response = await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        receiptId,
        amount: 50.01,
        method: "CASH",
        reason: "Trying it on",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/available to refund/i);
    // Nothing held, nothing recorded.
    expect((await readReceipt(receiptId)).refundedAmount.toFixed(2)).toBe("0.00");
    expect(await prisma.schoolFeeRefund.count({ where: { companyId } })).toBe(0);
  });

  it("refuses a second refund that would exceed the same credit", async () => {
    const receiptId = await creditOf(50);
    await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        receiptId,
        amount: 30,
        method: "CASH",
        reason: "First slice",
      }),
    );

    const second = await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        receiptId,
        amount: 30,
        method: "CASH",
        reason: "Second slice",
      }),
    );
    expect(second.status).toBe(400);
    expect((await readReceipt(receiptId)).refundedAmount.toFixed(2)).toBe("30.00");
  });

  it("pays a refund, records who paid it, and reports the posting outcome", async () => {
    const receiptId = await creditOf(50);
    const requested = await (
      await requestRefund(
        post("/api/v2/schools/finance/refunds", {
          receiptId,
          amount: 50,
          method: "BANK_TRANSFER",
          reason: "Overpaid the term's tuition",
        }),
      )
    ).json();

    const response = await payRefund(
      post(`/api/v2/schools/finance/refunds/${requested.id}/pay`, {
        reference: "EFT-99182",
      }),
      { params: Promise.resolve({ id: requested.id }) },
    );
    expect(response.status).toBe(200);
    const paid = await response.json();
    expect(paid.status).toBe("PAID");
    expect(paid.reference).toBe("EFT-99182");
    expect(paid.paidById).toBe(actorId);
    // A fresh tenant has no posting rules, so the honest outcome is a named
    // failure rather than silence. What must never happen is money leaving with
    // no attempt recorded.
    expect(["POSTED", "PENDING", "FAILED"]).toContain(paid.accounting.accountingStatus);

    const again = await payRefund(
      post(`/api/v2/schools/finance/refunds/${requested.id}/pay`, {}),
      { params: Promise.resolve({ id: requested.id }) },
    );
    expect(again.status).toBe(409);
  });

  it("releases the credit when a refund is cancelled, and not before", async () => {
    const receiptId = await creditOf(50);
    const requested = await (
      await requestRefund(
        post("/api/v2/schools/finance/refunds", {
          receiptId,
          amount: 50,
          method: "CASH",
          reason: "Typed the wrong figure",
        }),
      )
    ).json();

    const response = await cancelRefund(
      post(`/api/v2/schools/finance/refunds/${requested.id}/cancel`, {
        reason: "Wrong receipt",
      }),
      { params: Promise.resolve({ id: requested.id }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("CANCELLED");
    expect((await readReceipt(receiptId)).refundedAmount.toFixed(2)).toBe("0.00");

    const paying = await payRefund(
      post(`/api/v2/schools/finance/refunds/${requested.id}/pay`, {}),
      { params: Promise.resolve({ id: requested.id }) },
    );
    expect(paying.status).toBe(409);
  });

  it("refunds an over-settled invoice as well as an over-large payment", async () => {
    const invoiceId = await makeInvoice(450);
    await postReceipt(
      post("/api/v2/schools/fees/receipts", { invoiceId, amount: 450, method: "CASH" }),
    );
    await prisma.schoolFeeWaiver.create({
      data: {
        companyId,
        studentId,
        termId,
        invoiceId,
        waiverType: "SCHOLARSHIP",
        amount: new Prisma.Decimal(50),
        status: "APPLIED",
      },
    });
    const { refreshFeeInvoiceBalance } = await import("./_helpers");
    await prisma.$transaction((tx) =>
      refreshFeeInvoiceBalance(tx, { companyId, invoiceId }),
    );

    const response = await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        invoiceId,
        amount: 50,
        method: "CASH",
        reason: "Bursary granted after the bill was paid",
      }),
    );
    expect(response.status).toBe(201);
    expect((await readInvoice(invoiceId)).refundedAmount.toFixed(2)).toBe("50.00");

    const tooMuch = await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        invoiceId,
        amount: 1,
        method: "CASH",
        reason: "One more",
      }),
    );
    expect(tooMuch.status).toBe(400);
  });

  it("refuses a refund that names neither source, or both", async () => {
    const receiptId = await creditOf(50);
    const invoiceId = await makeInvoice(100, otherFeeStructureId);

    for (const body of [
      { amount: 10, method: "CASH", reason: "No source" },
      { receiptId, invoiceId, amount: 10, method: "CASH", reason: "Two sources" },
    ]) {
      const response = await requestRefund(
        post("/api/v2/schools/finance/refunds", body),
      );
      expect(response.status).toBe(400);
    }
  });

  it("will not void a receipt whose credit has already gone back to the parent", async () => {
    const receiptId = await creditOf(50);
    await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        receiptId,
        amount: 50,
        method: "CASH",
        reason: "Overpaid",
      }),
    );

    // Voiding reverses the whole receipt in the ledger. With part of it already
    // refunded that would count the same money out twice.
    const response = await voidReceipt(
      post(`/api/v2/schools/fees/receipts/${receiptId}/void`, {
        reason: "Changed my mind",
      }),
      { params: Promise.resolve({ id: receiptId }) },
    );
    expect(response.status).toBe(409);
    expect((await readReceipt(receiptId)).status).toBe("POSTED");
  });

  it("lists refunds for the bursar's screen", async () => {
    const receiptId = await creditOf(50);
    await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        receiptId,
        amount: 25,
        method: "CASH",
        reason: "Half back",
      }),
    );

    const response = await listRefunds(get("/api/v2/schools/finance/refunds"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].receipt.receiptNo).toBeTruthy();
  });
});

describe("S-2.5 / S-2.6 — every privileged action leaves a record", () => {
  it("writes an audit event for the receipt, the allocation and the refund", async () => {
    const invoiceId = await makeInvoice(450);
    const receipt = await (
      await postReceipt(
        post("/api/v2/schools/fees/receipts", {
          invoiceId,
          amount: 500,
          method: "CASH",
        }),
      )
    ).json();

    const nextInvoice = await makeInvoice(300, otherFeeStructureId);
    await allocateCredit(
      post(`/api/v2/schools/fees/receipts/${receipt.id}/allocate`, {
        allocations: [{ invoiceId: nextInvoice, allocatedAmount: 10 }],
      }),
      { params: Promise.resolve({ id: receipt.id }) },
    );
    await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        receiptId: receipt.id,
        amount: 40,
        method: "CASH",
        reason: "The rest back",
      }),
    );

    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId },
      select: { eventType: true, actor: true, entityId: true, prevEventHash: true },
      orderBy: { createdAt: "asc" },
    });
    const types = events.map((event) => event.eventType);
    expect(types).toContain("schools.fee.receipt.recorded");
    expect(types).toContain("schools.fee.credit.allocated");
    expect(types).toContain("schools.fee.refund.requested");
    expect(events.every((event) => event.actor === actorId)).toBe(true);
    // Chained: everything after the first names its predecessor.
    expect(events.slice(1).every((event) => Boolean(event.prevEventHash))).toBe(true);
  });

  it("rolls the audit row back with the action it describes", async () => {
    const invoiceId = await makeInvoice(450);
    const before = await prisma.platformAuditEvent.count({ where: { companyId } });

    // A named allocation over the balance aborts the transaction. The audit row
    // is written inside it, so there must be nothing left behind describing a
    // receipt that was never created.
    const response = await postReceipt(
      post("/api/v2/schools/fees/receipts", {
        studentId,
        receiptDate: "2026-05-10",
        paymentMethod: "CASH",
        amountReceived: 500,
        allocations: [{ invoiceId, allocatedAmount: 500 }],
      }),
    );
    expect(response.status).toBe(400);
    expect(await prisma.platformAuditEvent.count({ where: { companyId } })).toBe(before);
  });
});

// =============================================================================
// Migration witnesses — inserted past the service layer
// =============================================================================

describe("S-2.5 — the receipt's parts add up to its whole — MIGRATION WITNESS", () => {
  async function bareReceipt(received: number, allocated: number, unallocated: number) {
    return prisma.$executeRaw`
      INSERT INTO "SchoolFeeReceipt"
        ("id", "companyId", "receiptNo", "studentId", "receiptDate", "paymentMethod",
         "amountReceived", "amountAllocated", "amountUnallocated", "status", "updatedAt")
      VALUES
        (gen_random_uuid()::text, ${companyId}, ${`RAW-${Math.random()}`}, ${studentId},
         NOW(), 'CASH', ${received}, ${allocated}, ${unallocated}, 'POSTED', NOW())
    `;
  }

  it("refuses a receipt whose surplus was dropped", async () => {
    // $500 received, $450 allocated, and the $50 quietly forgotten. This is
    // exactly the shape S-2.5 exists to make impossible, and no application
    // code is involved in refusing it.
    await expect(bareReceipt(500, 450, 0)).rejects.toThrow(
      /split_adds_up|violates check constraint/i,
    );
  });

  it("accepts a receipt whose surplus is carried", async () => {
    await expect(bareReceipt(500, 450, 50)).resolves.toBeGreaterThan(0);
  });

  it("refuses a receipt for nothing", async () => {
    await expect(bareReceipt(0, 0, 0)).rejects.toThrow(/violates check constraint/i);
  });

  it("refuses an allocation line of zero", async () => {
    const invoiceId = await makeInvoice(100);
    const receipt = await prisma.schoolFeeReceipt.create({
      data: {
        companyId,
        receiptNo: `RAW-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
        studentId,
        receiptDate: new Date(),
        paymentMethod: "CASH",
        amountReceived: new Prisma.Decimal(100),
        amountAllocated: new Prisma.Decimal(0),
        amountUnallocated: new Prisma.Decimal(100),
        status: "POSTED",
      },
      select: { id: true },
    });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "SchoolFeeReceiptAllocation"
          ("id", "companyId", "receiptId", "invoiceId", "allocatedAmount", "updatedAt")
        VALUES
          (gen_random_uuid()::text, ${companyId}, ${receipt.id}, ${invoiceId}, 0, NOW())
      `,
    ).rejects.toThrow(/violates check constraint/i);
  });
});

describe("S-2.5 — an invoice cannot owe and be owed at once — MIGRATION WITNESS", () => {
  it("refuses a positive balance beside a positive credit", async () => {
    const invoiceId = await makeInvoice(450);
    await expect(
      prisma.$executeRaw`
        UPDATE "SchoolFeeInvoice"
        SET "balanceAmount" = 100, "creditAmount" = 100
        WHERE "id" = ${invoiceId}
      `,
    ).rejects.toThrow(/credit_xor_balance|violates check constraint/i);
  });

  it("refuses a negative balance", async () => {
    const invoiceId = await makeInvoice(450);
    await expect(
      prisma.$executeRaw`
        UPDATE "SchoolFeeInvoice" SET "balanceAmount" = -1 WHERE "id" = ${invoiceId}
      `,
    ).rejects.toThrow(/violates check constraint/i);
  });
});

describe("S-2.6 — a refund cannot exceed its credit — MIGRATION WITNESS", () => {
  it("refuses to hold more of a receipt than is unallocated", async () => {
    const invoiceId = await makeInvoice(450);
    const created = await (
      await postReceipt(
        post("/api/v2/schools/fees/receipts", {
          invoiceId,
          amount: 500,
          method: "CASH",
        }),
      )
    ).json();

    // Straight at the column, with no route in the way: $50 of credit, $50.01
    // claimed. This is the constraint the two-bursars race lands on.
    await expect(
      prisma.$executeRaw`
        UPDATE "SchoolFeeReceipt" SET "refundedAmount" = 50.01 WHERE "id" = ${created.id}
      `,
    ).rejects.toThrow(/refunded_within|violates check constraint/i);

    await expect(
      prisma.$executeRaw`
        UPDATE "SchoolFeeReceipt" SET "refundedAmount" = 50 WHERE "id" = ${created.id}
      `,
    ).resolves.toBe(1);
  });

  it("refuses to allocate credit away from under a held refund", async () => {
    const invoiceId = await makeInvoice(450);
    const created = await (
      await postReceipt(
        post("/api/v2/schools/fees/receipts", {
          invoiceId,
          amount: 500,
          method: "CASH",
        }),
      )
    ).json();
    await requestRefund(
      post("/api/v2/schools/finance/refunds", {
        receiptId: created.id,
        amount: 50,
        method: "CASH",
        reason: "Held",
      }),
    );

    const nextInvoice = await makeInvoice(300, otherFeeStructureId);
    const response = await allocateCredit(
      post(`/api/v2/schools/fees/receipts/${created.id}/allocate`, {
        allocations: [{ invoiceId: nextInvoice, allocatedAmount: 50 }],
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("refuses to hold more of an invoice than it is over-settled by", async () => {
    const invoiceId = await makeInvoice(450);
    await expect(
      prisma.$executeRaw`
        UPDATE "SchoolFeeInvoice" SET "refundedAmount" = 1 WHERE "id" = ${invoiceId}
      `,
    ).rejects.toThrow(/refunded_within|violates check constraint/i);
  });

  it("refuses a refund row with no source, or with two — MIGRATION WITNESS", async () => {
    const invoiceId = await makeInvoice(450);
    const receipt = await prisma.schoolFeeReceipt.create({
      data: {
        companyId,
        receiptNo: `RAW2-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
        studentId,
        receiptDate: new Date(),
        paymentMethod: "CASH",
        amountReceived: new Prisma.Decimal(100),
        amountAllocated: new Prisma.Decimal(0),
        amountUnallocated: new Prisma.Decimal(100),
        status: "POSTED",
      },
      select: { id: true },
    });

    const insert = (receiptId: string | null, invoice: string | null) =>
      prisma.$executeRaw`
        INSERT INTO "SchoolFeeRefund"
          ("id", "companyId", "refundNo", "studentId", "receiptId", "invoiceId",
           "refundDate", "method", "reason", "amount", "updatedAt")
        VALUES
          (gen_random_uuid()::text, ${companyId}, ${`RAW-${Math.random()}`}, ${studentId},
           ${receiptId}, ${invoice}, NOW(), 'CASH', 'raw', 10, NOW())
      `;

    await expect(insert(null, null)).rejects.toThrow(/violates check constraint/i);
    await expect(insert(receipt.id, invoiceId)).rejects.toThrow(
      /violates check constraint/i,
    );
    await expect(insert(receipt.id, null)).resolves.toBe(1);
  });

  it("refuses a refund of nothing — MIGRATION WITNESS", async () => {
    const receipt = await prisma.schoolFeeReceipt.create({
      data: {
        companyId,
        receiptNo: `RAW3-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
        studentId,
        receiptDate: new Date(),
        paymentMethod: "CASH",
        amountReceived: new Prisma.Decimal(100),
        amountAllocated: new Prisma.Decimal(0),
        amountUnallocated: new Prisma.Decimal(100),
        status: "POSTED",
      },
      select: { id: true },
    });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "SchoolFeeRefund"
          ("id", "companyId", "refundNo", "studentId", "receiptId",
           "refundDate", "method", "reason", "amount", "updatedAt")
        VALUES
          (gen_random_uuid()::text, ${companyId}, ${`RAW-${Math.random()}`}, ${studentId},
           ${receipt.id}, NOW(), 'CASH', 'raw', 0, NOW())
      `,
    ).rejects.toThrow(/violates check constraint/i);
  });
});
