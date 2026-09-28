/**
 * One stored daily report, read for its own page — the link the close-the-day
 * notification carries — through the real handler and a real database.
 *
 * Read the way the list reads: somebody's own report, or anybody's for a
 * manager; not found for anybody else.
 *
 * The session and the capability check are mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

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

const SLUG = "crm-daily-report-record-test";

let companyId: string;
let tendai: string;
let rudo: string;
let reportId: string;

async function read(as: string) {
  validateSessionMock.mockResolvedValue({ session: { user: { id: as, companyId, role: "SALES_REP" } } });
  const response = await GET(new NextRequest(`http://crm.test/api/v2/crm/daily-reports/${reportId}`), {
    params: Promise.resolve({ id: reportId }),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Daily Report Record Test", slug: SLUG },
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
  await prisma.crmDailyReport.deleteMany({ where: { companyId } });
  const report = await prisma.crmDailyReport.create({
    data: {
      companyId,
      userId: tendai,
      reportDate: new Date("2026-09-25T00:00:00.000Z"),
      summary: { version: 1, notes: "As it was sent" },
    },
  });
  reportId = report.id;
});

beforeEach(() => {
  capabilityMock.mockResolvedValue(false);
});

afterAll(async () => {
  await prisma.crmDailyReport.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("a daily report on its own page", () => {
  it("is read by the person whose day it was", async () => {
    const { status, body } = await read(tendai);
    expect(status).toBe(200);
    expect(body.report).toMatchObject({ id: reportId, user: { id: tendai, name: "tendai" } });
    expect(body.report.summary.notes).toBe("As it was sent");
  });

  it("is not found for a colleague", async () => {
    const { status } = await read(rudo);
    expect(status).toBe(404);
  });

  it("is read by a manager", async () => {
    capabilityMock.mockResolvedValue(true);
    const { status } = await read(rudo);
    expect(status).toBe(200);
  });
});
