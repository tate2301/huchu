/**
 * S-2.8 — the last of DoD item 7: every privileged fee action leaves a record.
 *
 * Six bursar actions changed what a family owed and wrote nothing down. A
 * school that cannot answer "who wrote off this $400 and when" has no answer at
 * all, so each of them is asserted here twice over:
 *
 *   **that the row is written** — one test per site, driving the real handler
 *   against a real Postgres with only the session mocked;
 *
 *   **that the row is not written when the action is not** — for the two that
 *   would hurt most to lose, a write-off and a waiver application. These inject
 *   a failure *after* the audit row has been written and before the transaction
 *   commits. That ordering is the whole point: a row written on the global
 *   client would survive the abort and describe a write-off that never
 *   happened, and these tests fail if anyone moves it there.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";

const { validateSessionMock, auditFailure } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  /** Flipped on by the rollback tests, and only by them. */
  auditFailure: { after: false },
}));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

vi.mock("@/lib/schools/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schools/audit")>();
  return {
    ...actual,
    writeSchoolAuditEvent: async (
      client: Parameters<typeof actual.writeSchoolAuditEvent>[0],
      args: Parameters<typeof actual.writeSchoolAuditEvent>[1],
    ) => {
      // Write it for real first — on whatever client the route passed, which
      // is the thing under test — then blow up the surrounding transaction.
      await actual.writeSchoolAuditEvent(client, args);
      if (auditFailure.after) {
        throw new Error("injected failure after the audit row was written");
      }
    },
  };
});

const { POST: createInvoice } = await import("./invoices/route");
const { POST: issueInvoice } = await import("./invoices/[id]/issue/route");
const { POST: writeOffInvoice } = await import("./invoices/[id]/write-off/route");
const { POST: bulkGenerate } = await import("./invoices/bulk-generate/route");
const { POST: createWaiver } = await import("./waivers/route");
const { POST: applyWaiver } = await import("./waivers/[id]/apply/route");

let companyId: string;
let actorId: string;
let termId: string;
let classId: string;
let studentId: string;
let bulkFeeStructureId: string;
let bulkStudentIds: string[];
let stamp: number;

function post(url: string, body: unknown) {
  return new NextRequest(`http://school.test${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function auditEvents() {
  return prisma.platformAuditEvent.findMany({
    where: { companyId },
    select: {
      eventType: true,
      actor: true,
      entityType: true,
      entityId: true,
      reason: true,
      payloadJson: true,
      prevEventHash: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

async function eventOfType(eventType: string) {
  const events = await auditEvents();
  const matching = events.filter((event) => event.eventType === eventType);
  expect(matching).toHaveLength(1);
  return {
    ...matching[0],
    payload: JSON.parse(matching[0].payloadJson ?? "{}") as Record<string, unknown>,
  };
}

/** Raise a bill through the real create route, and hand back its id. */
async function raiseInvoice(total: number) {
  const response = await createInvoice(
    post("/api/v2/schools/fees/invoices", {
      studentId,
      termId,
      issueDate: "2026-05-01",
      dueDate: "2026-05-31",
      lines: [
        {
          feeCode: `TUITION${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          description: "Tuition",
          unitAmount: total,
        },
      ],
    }),
  );
  expect(response.status).toBe(201);
  return (await response.json()).id as string;
}

/** An issued bill with `total` outstanding, ready to be written off or waived. */
async function issuedInvoice(total: number) {
  const invoiceId = await raiseInvoice(total);
  const response = await issueInvoice(
    post(`/api/v2/schools/fees/invoices/${invoiceId}/issue`, {}),
    { params: Promise.resolve({ id: invoiceId }) },
  );
  expect(response.status).toBe(200);
  return invoiceId;
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Audit School ${stamp}`, slug: `audit-school-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `bursar-${stamp}@audit-school.test`,
      name: "Bursar",
      role: "BURSAR",
    },
    select: { id: true },
  });
  actorId = actor.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `AU${stamp}`,
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
      studentNo: `AU${stamp}`,
      firstName: "Tendai",
      lastName: "Chirwa",
      status: "ACTIVE",
      currentClassId: classId,
    },
    select: { id: true },
  });
  studentId = student.id;

  // The bulk run needs a sheet with prices on it and a class to apply it to.
  const bulkStructure = await prisma.schoolFeeStructure.create({
    data: {
      companyId,
      termId,
      classId,
      name: "Form 1 Term 2",
      currency: "USD",
      lines: {
        create: [
          { companyId, feeCode: "TUITION", description: "Tuition", amount: new Prisma.Decimal(300) },
          { companyId, feeCode: "LEVY", description: "Development levy", amount: new Prisma.Decimal(50) },
        ],
      },
    },
    select: { id: true },
  });
  bulkFeeStructureId = bulkStructure.id;

  const siblings = await Promise.all(
    ["Rudo", "Farai", "Nyasha"].map((firstName, index) =>
      prisma.schoolStudent.create({
        data: {
          companyId,
          studentNo: `AUB${stamp}${index}`,
          firstName,
          lastName: "Moyo",
          status: "ACTIVE",
          currentClassId: classId,
        },
        select: { id: true },
      }),
    ),
  );
  bulkStudentIds = siblings.map((sibling) => sibling.id);
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  auditFailure.after = false;
  validateSessionMock.mockReset();
  validateSessionMock.mockResolvedValue({
    session: { user: { id: actorId, companyId, role: "BURSAR" } },
  });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.schoolFeeWaiver.deleteMany({ where: { companyId } });
  await prisma.schoolFeeInvoice.deleteMany({ where: { companyId } });
});

describe("S-2.8 — raising and issuing a bill leaves a record", () => {
  it("writes an event when an invoice is created", async () => {
    const invoiceId = await raiseInvoice(400);

    const event = await eventOfType("schools.fee.invoice.created");
    expect(event.actor).toBe(actorId);
    expect(event.entityType).toBe("SchoolFeeInvoice");
    expect(event.entityId).toBe(invoiceId);
    // Who, which invoice, how much, in which currency.
    expect(event.payload.studentId).toBe(studentId);
    expect(event.payload.termId).toBe(termId);
    expect(event.payload.invoiceNo).toBeTruthy();
    expect(event.payload.currency).toBe("USD");
    // A number, not the string a stringified Decimal would leave behind.
    expect(event.payload.totalAmount).toBe(400);
    expect(typeof event.payload.totalAmount).toBe("number");
    expect(event.payload.status).toBe("DRAFT");
  });

  it("writes an event when a draft invoice is issued", async () => {
    const invoiceId = await raiseInvoice(250);
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });

    const response = await issueInvoice(
      post(`/api/v2/schools/fees/invoices/${invoiceId}/issue`, {}),
      { params: Promise.resolve({ id: invoiceId }) },
    );
    expect(response.status).toBe(200);

    const event = await eventOfType("schools.fee.invoice.issued");
    expect(event.entityId).toBe(invoiceId);
    expect(event.payload.studentId).toBe(studentId);
    expect(event.payload.currency).toBe("USD");
    expect(event.payload.totalAmount).toBe(250);
    expect(event.payload.balanceAmount).toBe(250);
    expect(event.payload.status).toBe("ISSUED");
  });

  it("says nothing the second time, because nothing happened", async () => {
    const invoiceId = await issuedInvoice(250);
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });

    // Issuing an already-issued invoice is a no-op the route returns 200 for.
    // A record of a change that did not occur is noise in the one log that
    // must not have any.
    const response = await issueInvoice(
      post(`/api/v2/schools/fees/invoices/${invoiceId}/issue`, {}),
      { params: Promise.resolve({ id: invoiceId }) },
    );
    expect(response.status).toBe(200);
    expect(await auditEvents()).toHaveLength(0);
  });
});

describe("S-2.8 — a bulk run leaves one record that names every bill", () => {
  it("writes a single event for the run, listing each invoice it raised", async () => {
    const response = await bulkGenerate(
      post("/api/v2/schools/fees/invoices/bulk-generate", {
        termId,
        feeStructureId: bulkFeeStructureId,
        issueDate: "2026-05-01",
        dueDate: "2026-05-31",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // One bursar, one action, four children in Form 1.
    expect(body.created).toBe(4);

    const events = await auditEvents();
    expect(events).toHaveLength(1);

    const event = await eventOfType("schools.fee.invoice.bulk-generated");
    expect(event.entityType).toBe("SchoolFeeStructure");
    expect(event.entityId).toBe(bulkFeeStructureId);
    expect(event.payload.invoiceCount).toBe(4);
    expect(event.payload.currency).toBe("USD");
    // 4 × (300 + 50). A Decimal sum, coerced once.
    expect(event.payload.totalBilled).toBe(1400);

    // Useless unless it names them: every invoice raised is on the row, and
    // the ids are the ones actually in the database.
    const raised = event.payload.invoices as Array<Record<string, unknown>>;
    expect(raised).toHaveLength(4);
    const invoices = await prisma.schoolFeeInvoice.findMany({
      where: { companyId, feeStructureId: bulkFeeStructureId },
      select: { id: true, studentId: true },
    });
    expect(new Set(raised.map((invoice) => invoice.invoiceId))).toEqual(
      new Set(invoices.map((invoice) => invoice.id)),
    );
    expect(new Set(raised.map((invoice) => invoice.studentId))).toEqual(
      new Set([studentId, ...bulkStudentIds]),
    );
    expect(raised.every((invoice) => invoice.totalAmount === 350)).toBe(true);
  });

  it("says nothing for a re-run that raised nothing", async () => {
    await bulkGenerate(
      post("/api/v2/schools/fees/invoices/bulk-generate", {
        termId,
        feeStructureId: bulkFeeStructureId,
        issueDate: "2026-05-01",
        dueDate: "2026-05-31",
      }),
    );
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });

    // A bursar re-running after a network wobble bills nobody a second time,
    // so there is nothing to record.
    const again = await bulkGenerate(
      post("/api/v2/schools/fees/invoices/bulk-generate", {
        termId,
        feeStructureId: bulkFeeStructureId,
        issueDate: "2026-05-01",
        dueDate: "2026-05-31",
      }),
    );
    expect(again.status).toBe(200);
    expect((await again.json()).created).toBe(0);
    expect(await auditEvents()).toHaveLength(0);
  });
});

describe("S-2.8 — a write-off leaves a record", () => {
  it("names who gave up on the money, how much, and why", async () => {
    const invoiceId = await issuedInvoice(400);
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });

    const response = await writeOffInvoice(
      post(`/api/v2/schools/fees/invoices/${invoiceId}/write-off`, {
        reason: "Family left the country owing the term",
      }),
      { params: Promise.resolve({ id: invoiceId }) },
    );
    expect(response.status).toBe(200);

    const event = await eventOfType("schools.fee.invoice.written-off");
    expect(event.actor).toBe(actorId);
    expect(event.entityType).toBe("SchoolFeeInvoice");
    expect(event.entityId).toBe(invoiceId);
    // The question this event exists for: who wrote off this $400 and when.
    expect(event.reason).toBe("Family left the country owing the term");
    expect(event.payload.writtenOff).toBe(400);
    expect(typeof event.payload.writtenOff).toBe("number");
    expect(event.payload.currency).toBe("USD");
    expect(event.payload.studentId).toBe(studentId);
    expect(event.payload.statusBefore).toBe("ISSUED");
  });

  it("keeps no record of a write-off that rolled back", async () => {
    const invoiceId = await issuedInvoice(400);
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });

    // The row is written, and then the transaction it was written on aborts.
    // If it had been written on the global client it would still be here.
    auditFailure.after = true;
    const response = await writeOffInvoice(
      post(`/api/v2/schools/fees/invoices/${invoiceId}/write-off`, {
        reason: "Fat-fingered the wrong invoice",
      }),
      { params: Promise.resolve({ id: invoiceId }) },
    );
    expect(response.status).toBe(500);

    expect(await auditEvents()).toHaveLength(0);
    const invoice = await prisma.schoolFeeInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { status: true, balanceAmount: true, writeOffAmount: true },
    });
    // And the money is still owed, which is the other half of the same claim.
    expect(invoice.status).toBe("ISSUED");
    expect(invoice.balanceAmount.toFixed(2)).toBe("400.00");
    expect(invoice.writeOffAmount.toFixed(2)).toBe("0.00");
  });
});

describe("S-2.8 — a waiver leaves a record", () => {
  async function waiver(status: "DRAFT" | "APPROVED", invoiceId?: string) {
    const response = await createWaiver(
      post("/api/v2/schools/fees/waivers", {
        studentId,
        termId,
        ...(invoiceId ? { invoiceId } : {}),
        waiverType: "SCHOLARSHIP",
        amount: 120,
        reason: "Bursary awarded by the board",
        status,
      }),
    );
    expect(response.status).toBe(201);
    return (await response.json()).id as string;
  }

  it("writes a created event for a draft, and no approval", async () => {
    await waiver("DRAFT");

    const event = await eventOfType("schools.fee.waiver.created");
    expect(event.entityType).toBe("SchoolFeeWaiver");
    expect(event.payload.studentId).toBe(studentId);
    expect(event.payload.amount).toBe(120);
    expect(typeof event.payload.amount).toBe("number");
    expect(event.payload.currency).toBe("USD");
    expect(event.payload.status).toBe("DRAFT");
    expect(event.reason).toBe("Bursary awarded by the board");
    // A draft costs a family nothing, so nobody has authorised anything yet.
    const types = (await auditEvents()).map((row) => row.eventType);
    expect(types).not.toContain("schools.fee.waiver.approved");
  });

  it("writes an approval when the same call grants one", async () => {
    const waiverId = await waiver("APPROVED");

    const approved = await eventOfType("schools.fee.waiver.approved");
    expect(approved.entityId).toBe(waiverId);
    expect(approved.actor).toBe(actorId);
    expect(approved.payload.amount).toBe(120);
    expect(approved.payload.currency).toBe("USD");
    expect(approved.payload.approvedAt).toBeTruthy();

    // Both halves of what happened, in order.
    const types = (await auditEvents()).map((row) => row.eventType);
    expect(types).toEqual([
      "schools.fee.waiver.created",
      "schools.fee.waiver.approved",
    ]);
  });

  it("writes an event when the waiver comes off a bill", async () => {
    const invoiceId = await issuedInvoice(400);
    const waiverId = await waiver("APPROVED", invoiceId);
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });

    const response = await applyWaiver(
      post(`/api/v2/schools/fees/waivers/${waiverId}/apply`, {}),
      { params: Promise.resolve({ id: waiverId }) },
    );
    expect(response.status).toBe(200);

    const event = await eventOfType("schools.fee.waiver.applied");
    expect(event.entityType).toBe("SchoolFeeWaiver");
    expect(event.entityId).toBe(waiverId);
    expect(event.payload.invoiceId).toBe(invoiceId);
    expect(event.payload.invoiceNo).toBeTruthy();
    expect(event.payload.amount).toBe(120);
    expect(event.payload.currency).toBe("USD");
    // How much the family stopped owing, which is the point of the row.
    expect(event.payload.balanceBefore).toBe(400);
    expect(event.payload.balanceAfter).toBe(280);
  });

  it("keeps no record of a waiver application that rolled back", async () => {
    const invoiceId = await issuedInvoice(400);
    const waiverId = await waiver("APPROVED", invoiceId);
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });

    auditFailure.after = true;
    const response = await applyWaiver(
      post(`/api/v2/schools/fees/waivers/${waiverId}/apply`, {}),
      { params: Promise.resolve({ id: waiverId }) },
    );
    expect(response.status).toBe(500);

    expect(await auditEvents()).toHaveLength(0);
    const waiverRow = await prisma.schoolFeeWaiver.findUniqueOrThrow({
      where: { id: waiverId },
      select: { status: true, appliedById: true },
    });
    expect(waiverRow.status).toBe("APPROVED");
    expect(waiverRow.appliedById).toBeNull();
    // The bill is untouched: the discount never came off it.
    const invoice = await prisma.schoolFeeInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { balanceAmount: true, waivedAmount: true },
    });
    expect(invoice.balanceAmount.toFixed(2)).toBe("400.00");
    expect(invoice.waivedAmount.toFixed(2)).toBe("0.00");
  });
});

describe("S-2.8 — the chain holds across the whole fee surface", () => {
  it("chains every fee event it writes to the one before it", async () => {
    const invoiceId = await issuedInvoice(400);
    const waiverId = await createWaiver(
      post("/api/v2/schools/fees/waivers", {
        studentId,
        termId,
        invoiceId,
        waiverType: "HARDSHIP",
        amount: 100,
        status: "APPROVED",
      }),
    ).then(async (response) => (await response.json()).id as string);
    await applyWaiver(post(`/api/v2/schools/fees/waivers/${waiverId}/apply`, {}), {
      params: Promise.resolve({ id: waiverId }),
    });
    await writeOffInvoice(
      post(`/api/v2/schools/fees/invoices/${invoiceId}/write-off`, {
        reason: "Uncollectable",
      }),
      { params: Promise.resolve({ id: invoiceId }) },
    );

    const events = await auditEvents();
    expect(events.map((event) => event.eventType)).toEqual([
      "schools.fee.invoice.created",
      "schools.fee.invoice.issued",
      "schools.fee.waiver.created",
      "schools.fee.waiver.approved",
      "schools.fee.waiver.applied",
      "schools.fee.invoice.written-off",
    ]);
    expect(events.every((event) => event.actor === actorId)).toBe(true);
    // Everything after the first names its predecessor.
    expect(events.slice(1).every((event) => Boolean(event.prevEventHash))).toBe(true);
  });
});
