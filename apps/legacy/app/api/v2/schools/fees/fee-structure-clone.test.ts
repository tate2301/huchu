/**
 * S-4.6 — copying a fee sheet up the class ladder.
 *
 * The behaviour worth pinning is not "it inserts rows" but the three refusals:
 * it will not overwrite a live fee sheet a school has already decided on, it
 * will not copy onto the source's own class, and it does not activate anything
 * unless asked. Each of those, got wrong, changes what a family is billed.
 *
 * Drives the real handler against a real Postgres with only the session mocked,
 * matching `fee-audit.test.ts`.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@corelithzw/db/client";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { POST: clone } = await import("./structures/[id]/clone/route");

let companyId: string;
let actorId: string;
let termId: string;
let otherTermId: string;
let sourceClassId: string;
let targetIds: string[];
let sourceId: string;
let stamp: number;

function post(id: string, body: unknown) {
  return {
    request: new NextRequest(`http://school.test/api/v2/schools/fees/structures/${id}/clone`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    context: { params: Promise.resolve({ id }) },
  };
}

async function callClone(id: string, body: unknown) {
  const { request, context } = post(id, body);
  const response = await clone(request, context);
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Clone School ${stamp}`, slug: `clone-school-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `bursar-${stamp}@clone-school.test`,
      name: "Bursar",
      role: "BURSAR",
    },
    select: { id: true },
  });
  actorId = actor.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `CL${stamp}`,
      name: "2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    },
    select: { id: true },
  });

  const [term, nextTerm] = await Promise.all([
    prisma.schoolTerm.create({
      data: {
        companyId,
        academicYearId: year.id,
        code: "T2",
        name: "Term 2",
        startDate: new Date("2026-05-01T00:00:00.000Z"),
        endDate: new Date("2026-08-01T00:00:00.000Z"),
      },
      select: { id: true },
    }),
    prisma.schoolTerm.create({
      data: {
        companyId,
        academicYearId: year.id,
        code: "T3",
        name: "Term 3",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-12-05T00:00:00.000Z"),
      },
      select: { id: true },
    }),
  ]);
  termId = term.id;
  otherTermId = nextTerm.id;

  const classes = await Promise.all(
    ["F1", "F2", "F3"].map((code, index) =>
      prisma.schoolClass.create({
        data: { companyId, code, name: `Form ${index + 1}`, level: index + 1 },
        select: { id: true },
      }),
    ),
  );
  sourceClassId = classes[0].id;
  targetIds = classes.slice(1).map((row) => row.id);
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: actorId, companyId, role: "BURSAR" } },
  });
  await prisma.schoolFeeStructure.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });

  const source = await prisma.schoolFeeStructure.create({
    data: {
      companyId,
      termId,
      classId: sourceClassId,
      name: "Term fees · Form 1",
      currency: "USD",
      status: "ACTIVE",
      lines: {
        create: [
          {
            companyId,
            feeCode: "TUITION",
            description: "Tuition",
            amount: "400.00",
            isMandatory: true,
            sortOrder: 0,
          },
          {
            companyId,
            feeCode: "DEV",
            description: "Development levy",
            amount: "50.50",
            isMandatory: true,
            sortOrder: 1,
          },
        ],
      },
    },
    select: { id: true },
  });
  sourceId = source.id;
});

describe("copying a fee sheet", () => {
  it("copies the lines across, to the penny", async () => {
    const { status, body } = await callClone(sourceId, { classIds: targetIds });
    expect(status).toBe(200);
    expect(body.created).toBe(2);

    const copies = await prisma.schoolFeeStructure.findMany({
      where: { companyId, classId: { in: targetIds } },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      // `toString()` rather than a number: a levy that arrives as 50.499999 is
      // the exact failure S-2.1 moved this column off Float to prevent.
      expect(copy.lines.map((line) => line.amount.toString())).toEqual(["400", "50.5"]);
      expect(copy.currency).toBe("USD");
      expect(copy.termId).toBe(termId);
    }
  });

  it("lands them as drafts unless told otherwise", async () => {
    await callClone(sourceId, { classIds: targetIds });
    const copies = await prisma.schoolFeeStructure.findMany({
      where: { companyId, classId: { in: targetIds } },
      select: { status: true },
    });
    // A bulk change to what families owe is proposed, then read, then activated.
    expect(copies.map((row) => row.status)).toEqual(["DRAFT", "DRAFT"]);
  });

  it("activates them when the bursar says so", async () => {
    await callClone(sourceId, { classIds: targetIds, status: "ACTIVE" });
    const copies = await prisma.schoolFeeStructure.findMany({
      where: { companyId, classId: { in: targetIds } },
      select: { status: true },
    });
    expect(copies.map((row) => row.status)).toEqual(["ACTIVE", "ACTIVE"]);
  });

  it("leaves a class that already has a live fee sheet alone, and names it", async () => {
    await prisma.schoolFeeStructure.create({
      data: {
        companyId,
        termId,
        classId: targetIds[0],
        name: "Form 2's own fees",
        currency: "USD",
        status: "ACTIVE",
        lines: {
          create: [
            {
              companyId,
              feeCode: "TUITION",
              description: "Tuition",
              amount: "600.00",
              isMandatory: true,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    const { body } = await callClone(sourceId, { classIds: targetIds, status: "ACTIVE" });
    expect(body.created).toBe(1);
    expect(body.skipped).toEqual(["F2"]);

    // The school's own sheet is untouched — not renamed, not re-priced.
    const kept = await prisma.schoolFeeStructure.findFirstOrThrow({
      where: { companyId, classId: targetIds[0], status: "ACTIVE" },
      include: { lines: true },
    });
    expect(kept.name).toBe("Form 2's own fees");
    expect(kept.lines[0].amount.toString()).toBe("600");
  });

  it("copies over an abandoned draft, which blocks nothing", async () => {
    await prisma.schoolFeeStructure.create({
      data: {
        companyId,
        termId,
        classId: targetIds[0],
        name: "Half-finished",
        currency: "USD",
        status: "DRAFT",
      },
    });

    const { body } = await callClone(sourceId, { classIds: targetIds });
    expect(body.created).toBe(2);
    expect(body.skipped).toEqual([]);
  });

  it("does not copy a sheet onto its own class", async () => {
    const { body } = await callClone(sourceId, {
      classIds: [sourceClassId, ...targetIds],
    });
    expect(body.created).toBe(2);
    const onSource = await prisma.schoolFeeStructure.count({
      where: { companyId, classId: sourceClassId },
    });
    expect(onSource).toBe(1);
  });

  it("copies into another term when asked", async () => {
    const { body } = await callClone(sourceId, {
      classIds: targetIds,
      termId: otherTermId,
    });
    expect(body.created).toBe(2);
    expect(body.term.code).toBe("T3");

    const copies = await prisma.schoolFeeStructure.findMany({
      where: { companyId, termId: otherTermId },
      select: { termId: true },
    });
    expect(copies).toHaveLength(2);
  });

  it("writes one audit row naming what was copied and what was left", async () => {
    await callClone(sourceId, { classIds: targetIds, status: "ACTIVE" });

    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId, eventType: "schools.fee.structure.cloned" },
      select: { entityId: true, payloadJson: true },
    });
    expect(events).toHaveLength(1);
    expect(events[0].entityId).toBe(sourceId);

    const payload = JSON.parse(events[0].payloadJson ?? "{}");
    expect(payload.created).toEqual(["F2", "F3"]);
    expect(payload.status).toBe("ACTIVE");
  });

  it("refuses a fee sheet with no lines rather than copying an empty one", async () => {
    const empty = await prisma.schoolFeeStructure.create({
      data: {
        companyId,
        termId,
        classId: sourceClassId,
        name: "Nothing in it",
        currency: "USD",
        status: "DRAFT",
      },
      select: { id: true },
    });

    const { status } = await callClone(empty.id, { classIds: targetIds });
    expect(status).toBe(400);
  });

  it("refuses a caller whose role cannot edit fees", async () => {
    validateSessionMock.mockResolvedValue({
      session: { user: { id: actorId, companyId, role: "TEACHER" } },
    });

    const { status } = await callClone(sourceId, { classIds: targetIds });
    expect(status).toBe(403);
    expect(await prisma.schoolFeeStructure.count({ where: { companyId } })).toBe(1);
  });
});
