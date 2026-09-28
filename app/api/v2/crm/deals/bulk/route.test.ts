/**
 * Acting on many deals at once, through the real handler and a real
 * database: a rep reassigns and archives their own deals and hears which of
 * the rest were left alone; a stage is not something a selection can be
 * moved to.
 *
 * The session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { POST } = await import("./route");

const SLUG = "crm-deals-bulk-test";
const OTHER = "crm-deals-bulk-test-other";

let companyId: string;
let tendai: string;
let rudo: string;
let pipelineId: string;
let stageId: string;
let mine: string;
let rudos: string;
let nobodys: string;
let stranger: string;

async function bulk(body: Record<string, unknown>, as = tendai, role = "SALES_REP") {
  validateSessionMock.mockResolvedValue({ session: { user: { id: as, companyId, role } } });
  const response = await POST(
    new NextRequest("http://crm.test/api/v2/crm/deals/bulk", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const [company, other] = await Promise.all(
    [SLUG, OTHER].map((slug) => prisma.company.create({ data: { name: slug, slug } })),
  );
  companyId = company.id;
  const users = await Promise.all(
    ["tendai", "rudo"].map((name) =>
      prisma.user.upsert({
        where: { email: `${SLUG}-${name}@example.invalid` },
        update: { companyId, role: "SALES_REP" },
        create: { email: `${SLUG}-${name}@example.invalid`, name, companyId, role: "SALES_REP" },
      }),
    ),
  );
  [tendai, rudo] = users.map((user) => user.id);

  const pipeline = await prisma.crmPipeline.create({
    data: { companyId, name: "Sales", isDefault: true, stages: { create: [{ companyId, name: "New", status: "OPEN" }] } },
    include: { stages: true },
  });
  pipelineId = pipeline.id;
  stageId = pipeline.stages[0].id;

  const otherPipeline = await prisma.crmPipeline.create({
    data: { companyId: other.id, name: "Sales", stages: { create: [{ companyId: other.id, name: "New", status: "OPEN" }] } },
    include: { stages: true },
  });
  stranger = (
    await prisma.crmDeal.create({
      data: {
        companyId: other.id,
        dealNo: "D-9",
        title: "Next door",
        pipelineId: otherPipeline.id,
        stageId: otherPipeline.stages[0].id,
      },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.crmDeal.deleteMany({ where: { companyId } });
  const deal = async (dealNo: string, assignedToId?: string) =>
    (await prisma.crmDeal.create({ data: { companyId, dealNo, title: dealNo, pipelineId, stageId, assignedToId } })).id;
  mine = await deal("D-1", tendai);
  rudos = await deal("D-2", rudo);
  nobodys = await deal("D-3");
});

afterAll(async () => {
  const company = { slug: { in: [SLUG, OTHER] } };
  await prisma.crmDeal.deleteMany({ where: { company } });
  await prisma.crmPipeline.deleteMany({ where: { company } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: company });
});

describe("bulk actions on deals", () => {
  it("archives what a rep may, and says what it skipped and why", async () => {
    const { status, body } = await bulk({ action: "archive", ids: [mine, rudos, nobodys, stranger] });
    expect(status).toBe(200);
    expect(body).toEqual({
      updated: 2,
      unchanged: 0,
      skipped: 1,
      notFound: 1,
      skippedReason: "they belong to someone else",
    });
    const archived = await prisma.crmDeal.findMany({ where: { companyId, archivedAt: { not: null } }, select: { id: true } });
    expect(archived.map((row) => row.id).sort()).toEqual([mine, nobodys].sort());
    // The deal next door is untouched.
    expect((await prisma.crmDeal.findUnique({ where: { id: stranger } }))?.archivedAt).toBeNull();
  });

  it("reads me as the person asking and counts the ones already theirs", async () => {
    const { body } = await bulk({ action: "assign", ids: [mine, nobodys], value: "me" });
    expect(body).toMatchObject({ updated: 1, unchanged: 1, skipped: 0 });
    expect((await prisma.crmDeal.findUnique({ where: { id: nobodys } }))?.assignedToId).toBe(tendai);
  });

  it("lets a manager restore anybody's", async () => {
    await bulk({ action: "archive", ids: [mine, rudos] }, rudo, "MANAGER");
    const { body } = await bulk({ action: "restore", ids: [mine, rudos, nobodys] }, rudo, "MANAGER");
    expect(body).toMatchObject({ updated: 2, unchanged: 1, skipped: 0 });
  });

  it("refuses a status change: a stage move is checked one deal at a time", async () => {
    const { status } = await bulk({ action: "status", ids: [mine], value: "WON" });
    expect(status).toBe(400);
    expect((await prisma.crmDeal.findUnique({ where: { id: mine } }))?.status).toBe("OPEN");
  });
});
