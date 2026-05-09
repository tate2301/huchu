/**
 * GoldShiftAllocation unique-constraint witness test (Epic 3 / §3.3 P0-5).
 *
 * Verifies the @@unique on GoldShiftAllocation has been widened from
 * (siteId, date, shift) to (siteId, date, shift, shiftGroupId), allowing
 * two parallel crews running the same shift label on the same date and
 * site to coexist.
 *
 * MIGRATION WITNESS: this test fails on the pre-Epic-3 schema and passes
 * after migration 20260510000001_add_shift_group_id_to_allocation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { factories } from "@/lib/gold/test-factories";

let companyId: string;
let siteId: string;
let leaderEmployeeId: string;
let createdById: string;
let groupAId: string;
let groupBId: string;

beforeAll(async () => {
  await prisma.$connect();

  const co = await prisma.company.create({ data: factories.company() });
  companyId = co.id;
  const si = await prisma.site.create({ data: factories.site(companyId) });
  siteId = si.id;
  const u = await prisma.user.create({
    data: factories.user(companyId) as unknown as Parameters<typeof prisma.user.create>[0]["data"],
  });
  createdById = u.id;
  const emp = await prisma.employee.create({ data: factories.employee(companyId) });
  leaderEmployeeId = emp.id;
  const gA = await prisma.shiftGroup.create({
    data: factories.shiftGroup(companyId, siteId, leaderEmployeeId, { name: "Crew Alpha" }),
  });
  groupAId = gA.id;
  const gB = await prisma.shiftGroup.create({
    data: factories.shiftGroup(companyId, siteId, leaderEmployeeId, { name: "Crew Bravo" }),
  });
  groupBId = gB.id;
});

afterAll(async () => {
  // Cascade clean: delete allocations, shift reports, then the seed parents.
  await prisma.goldShiftAllocation.deleteMany({ where: { siteId } });
  await prisma.shiftReport.deleteMany({ where: { siteId } });
  await prisma.shiftGroup.deleteMany({ where: { siteId } });
  await prisma.employee.deleteMany({ where: { id: leaderEmployeeId } });
  await prisma.user.deleteMany({ where: { id: createdById } });
  await prisma.site.delete({ where: { id: siteId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

async function makeShiftReport(shiftGroupId: string | null) {
  return prisma.shiftReport.create({
    data: {
      date: new Date("2026-01-15"),
      shift: "DAY",
      siteId,
      shiftGroupId,
      groupLeaderId: leaderEmployeeId,
      crewCount: 5,
      workType: "EXTRACTION",
      createdById,
    },
  });
}

async function makeAllocation(shiftReportId: string, shiftGroupId: string | null) {
  // Factory types splitMode/workflowStatus as string for cross-schema compatibility;
  // cast to Prisma's enum type when feeding into create().
  const data = {
    ...factories.goldShiftAllocation(siteId, shiftReportId, {
      date: new Date("2026-01-15"),
      shift: "DAY",
      createdById,
    }),
    shiftGroupId,
  } as unknown as Parameters<typeof prisma.goldShiftAllocation.create>[0]["data"];
  return prisma.goldShiftAllocation.create({ data });
}

describe("GoldShiftAllocation unique constraint — Epic 3 widening", () => {
  it("allows two allocations with same (siteId, date, shift) but different shiftGroupId", async () => {
    const reportA = await makeShiftReport(groupAId);
    const reportB = await makeShiftReport(groupBId);

    const allocA = await makeAllocation(reportA.id, groupAId);
    const allocB = await makeAllocation(reportB.id, groupBId);

    expect(allocA.id).not.toBe(allocB.id);
    expect(allocA.shiftGroupId).toBe(groupAId);
    expect(allocB.shiftGroupId).toBe(groupBId);

    // Cleanup so subsequent tests start fresh
    await prisma.goldShiftAllocation.deleteMany({ where: { id: { in: [allocA.id, allocB.id] } } });
    await prisma.shiftReport.deleteMany({ where: { id: { in: [reportA.id, reportB.id] } } });
  });

  it("rejects a duplicate (siteId, date, shift, shiftGroupId)", async () => {
    const reportA = await makeShiftReport(groupAId);
    const reportDup = await makeShiftReport(groupAId);

    await makeAllocation(reportA.id, groupAId);

    await expect(makeAllocation(reportDup.id, groupAId)).rejects.toMatchObject({
      // Prisma wraps Postgres unique violation as P2002
      code: "P2002",
    });

    await prisma.goldShiftAllocation.deleteMany({ where: { siteId, date: new Date("2026-01-15") } });
    await prisma.shiftReport.deleteMany({ where: { id: { in: [reportA.id, reportDup.id] } } });
  });
});
