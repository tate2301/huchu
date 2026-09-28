/**
 * One line of money, read for its own page, through the real handler and a
 * real database.
 *
 * Pinned: a line is read by the person it belongs to, or by whoever may see
 * everybody's money, and is not found for anybody else. And the page is told
 * it may take the line back out only when the delete would: the line is the
 * reader's own and its day is still open.
 *
 * The session and the capability check are mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { addCostEntry } from "@/lib/crm/daily-log";

const { validateSessionMock, capabilityMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  capabilityMock: vi.fn(),
}));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});
vi.mock("../../_helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../_helpers")>();
  return { ...actual, requireCrmCapability: capabilityMock };
});

const { GET } = await import("./route");

const SLUG = "crm-cost-entry-record-test";

let companyId: string;
let tendai: string;
let rudo: string;

async function read(id: string, as: string) {
  validateSessionMock.mockResolvedValue({ session: { user: { id: as, companyId, role: "SALES_REP" } } });
  const response = await GET(new NextRequest(`http://crm.test/api/v2/crm/cost-entries/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: await response.json() };
}

async function line(userId: string) {
  return prisma.$transaction((tx) =>
    addCostEntry(tx, {
      companyId,
      userId,
      direction: "SPENT",
      category: "FUEL",
      amount: 40,
      currency: "USD",
      description: "Diesel for the bakkie",
    }),
  );
}

async function wipe() {
  await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
  await prisma.crmDailyLog.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Cost Entry Record Test", slug: SLUG },
  });
  companyId = company.id;
  const users = await Promise.all(
    ["tendai", "rudo"].map((name) =>
      prisma.user.upsert({
        where: { email: `${SLUG}-${name}@example.invalid` },
        update: {},
        create: { email: `${SLUG}-${name}@example.invalid`, name, companyId, role: "SALES_REP" },
      }),
    ),
  );
  [tendai, rudo] = users.map((user) => user.id);
});

beforeEach(async () => {
  await wipe();
  capabilityMock.mockResolvedValue(false);
});

afterAll(async () => {
  await wipe();
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("a line of money on its own page", () => {
  it("is read by its owner, who may take it back out while the day is open", async () => {
    const entry = await line(tendai);
    const { status, body } = await read(entry.id, tendai);
    expect(status).toBe(200);
    expect(body.entry).toMatchObject({ id: entry.id, description: "Diesel for the bakkie" });
    expect(body.mayRemove).toBe(true);
  });

  it("is not found for a colleague", async () => {
    const entry = await line(tendai);
    const { status } = await read(entry.id, rudo);
    expect(status).toBe(404);
  });

  it("is read by whoever may see everybody's money, who may not remove it", async () => {
    const entry = await line(tendai);
    capabilityMock.mockResolvedValue(true);
    const { status, body } = await read(entry.id, rudo);
    expect(status).toBe(200);
    expect(body.mayRemove).toBe(false);
  });

  it("stays once its day is closed", async () => {
    const entry = await line(tendai);
    await prisma.crmDailyLog.update({ where: { id: entry.logId }, data: { submittedAt: new Date() } });
    const { body } = await read(entry.id, tendai);
    expect(body.mayRemove).toBe(false);
  });
});
