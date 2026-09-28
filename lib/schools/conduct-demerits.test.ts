/**
 * A category configured to draw demerits actually draws them.
 *
 * `logIncident` looked a `SchoolMeritReason` up by exact `name` match against
 * the category's name and, finding none, did nothing at all. Categories and
 * reasons are created independently and nothing in the product ever made one to
 * match the other — so the normal case was no match, and a category configured
 * for three demerits drew none, silently, forever.
 *
 * It was not silent to the user. The incident dialog reads
 * `category.demeritPoints` and says "Logging this also records 3 demerits"
 * before they press the button, so the screen promised something the write path
 * then declined to do.
 *
 * Prerequisites: a real Postgres DATABASE_URL_TEST with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { logIncident, updateIncident } from "./conduct";

let companyId: string;
let termId: string;
let studentId: string;
let categoryId: string;
let plainCategoryId: string;

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Conduct Demerits ${stamp}`, slug: `conduct-demerits-${stamp}` },
  });
  companyId = company.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: "2026",
      name: "2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });
  const term = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: year.id,
      code: "T1",
      name: "Term 1",
      startDate: new Date("2026-01-10"),
      endDate: new Date("2026-04-10"),
    },
  });
  termId = term.id;

  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `CD-${stamp}`,
      firstName: "Tinashe",
      lastName: "Gono",
      status: "ACTIVE",
    },
  });
  studentId = student.id;

  // A category that draws demerits, and NO merit reason anywhere to match it —
  // which is the state every school is in.
  const category = await prisma.schoolConductCategory.create({
    data: { companyId, code: "LATE", name: "Late to school", demeritPoints: 3 },
  });
  categoryId = category.id;

  const plain = await prisma.schoolConductCategory.create({
    data: { companyId, code: "NOTE", name: "Worth noting", demeritPoints: null },
  });
  plainCategoryId = plain.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("a category that draws demerits", () => {
  it("records them even though no reason existed to match it", async () => {
    await logIncident({
      companyId,
      actorId: "head-of-year",
      termId,
      studentId,
      categoryId,
      occurredAt: new Date("2026-02-03T08:10:00.000Z"),
      summary: "Third time this week",
    });

    const entries = await prisma.schoolMeritEntry.findMany({
      where: { companyId, studentId, kind: "DEMERIT" },
      select: { points: true, reason: { select: { name: true, code: true } } },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].points).toBe(3);
    // The reason is made from the category, so the ledger reads as the school
    // would expect rather than as "Not named".
    expect(entries[0].reason.name).toBe("Late to school");
    expect(entries[0].reason.code).toBe("CAT-LATE");
  });

  it("reuses the reason rather than making one per incident", async () => {
    await logIncident({
      companyId,
      actorId: "head-of-year",
      termId,
      studentId,
      categoryId,
      occurredAt: new Date("2026-02-04T08:10:00.000Z"),
      summary: "And again",
    });

    const reasons = await prisma.schoolMeritReason.findMany({
      where: { companyId, kind: "DEMERIT" },
    });
    expect(reasons).toHaveLength(1);
    const entries = await prisma.schoolMeritEntry.count({
      where: { companyId, studentId, kind: "DEMERIT" },
    });
    expect(entries).toBe(2);
  });

  it("draws nothing for a category with no demerit points", async () => {
    // The other half: a school that does not run a points system must not have
    // one invented for it.
    const before = await prisma.schoolMeritEntry.count({ where: { companyId } });
    await logIncident({
      companyId,
      actorId: "head-of-year",
      termId,
      studentId,
      categoryId: plainCategoryId,
      occurredAt: new Date("2026-02-05T08:10:00.000Z"),
      summary: "Left a bag in the corridor",
    });
    expect(await prisma.schoolMeritEntry.count({ where: { companyId } })).toBe(before);
  });
});

describe("editing an incident's location", () => {
  /*
    Two failures, one line apart, and fixing the first created the second.

    `updateIncident` used to write `location: args.data.location?.trim() || null`
    unconditionally, so `undefined?.trim() || null` turned an ABSENT field into
    an explicit null — every patch that did not resend the location erased it.

    Guarding on `!== undefined` fixed that and broke clearing, because the route
    was doing `body.location ?? undefined` and `??` catches null: a reader who
    rubbed the field out sent `null`, the route flattened it to "not mentioned",
    and the guard skipped it while the dialog reported success.

    Three states, and all three have to survive the trip.
  */
  let incidentId: string;

  beforeAll(async () => {
    const incident = await logIncident({
      companyId,
      actorId: "head-of-year",
      termId,
      studentId,
      categoryId: plainCategoryId,
      occurredAt: new Date("2026-03-01T09:00:00.000Z"),
      summary: "Somewhere in particular",
      location: "Science block",
    });
    incidentId = incident.id;
  });

  it("keeps the location when a patch does not mention it", async () => {
    await updateIncident({
      companyId,
      actorId: "head-of-year",
      incidentId,
      data: { summary: "Corrected wording" },
    });
    const after = await prisma.schoolConductIncident.findUniqueOrThrow({
      where: { id: incidentId },
      select: { location: true, summary: true },
    });
    expect(after.summary).toBe("Corrected wording");
    expect(after.location).toBe("Science block");
  });

  it("clears the location when it is explicitly sent as null", async () => {
    await updateIncident({
      companyId,
      actorId: "head-of-year",
      incidentId,
      data: { location: null },
    });
    const after = await prisma.schoolConductIncident.findUniqueOrThrow({
      where: { id: incidentId },
      select: { location: true },
    });
    expect(after.location).toBeNull();
  });

  it("sets a new location when one is sent", async () => {
    await updateIncident({
      companyId,
      actorId: "head-of-year",
      incidentId,
      data: { location: "The quad" },
    });
    const after = await prisma.schoolConductIncident.findUniqueOrThrow({
      where: { id: incidentId },
      select: { location: true },
    });
    expect(after.location).toBe("The quad");
  });
});
