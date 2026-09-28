/**
 * Acting on many leads at once, through the real handler and a real
 * database. Each lead keeps the history a single change leaves: Lost asks why
 * and keeps the answer, a move past Contacted makes the lead a deal as a drag
 * on the board does, and a converted lead stays archived beside its deal.
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

const SLUG = "crm-leads-bulk-test";

let companyId: string;
let tendai: string;
let rudo: string;
const ids: Record<string, string> = {};

async function bulk(body: Record<string, unknown>, as = tendai, role = "SALES_REP") {
  validateSessionMock.mockResolvedValue({ session: { user: { id: as, companyId, role } } });
  const response = await POST(
    new NextRequest("http://crm.test/api/v2/crm/leads/bulk", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: response.status, body: await response.json() };
}

const lead = (id: string) => prisma.crmLead.findUniqueOrThrow({ where: { id } });

async function wipe() {
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.crmDeal.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await prisma.company.create({ data: { name: SLUG, slug: SLUG } })).id;
  [tendai, rudo] = await Promise.all(
    ["tendai", "rudo"].map(
      async (name) =>
        (
          await prisma.user.create({
            data: { email: `${SLUG}-${name}@example.invalid`, name, companyId, role: "SALES_REP" },
          })
        ).id,
    ),
  );
});

beforeEach(async () => {
  await wipe();
  const create = async (leadNo: string, data: Record<string, unknown> = {}) =>
    (await prisma.crmLead.create({ data: { companyId, leadNo, title: leadNo, ...data } as never })).id;
  ids.fresh = await create("L-1", { assignedToId: tendai });
  ids.called = await create("L-2", { assignedToId: tendai, stage: "CONTACTED" });
  ids.rudos = await create("L-3", { assignedToId: rudo });
  ids.nobodys = await create("L-4");
});

afterAll(async () => {
  await wipe();
  await prisma.crmPipelineStage.deleteMany({ where: { companyId } });
  await prisma.crmPipeline.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("bulk actions on leads", () => {
  it("asks why before marking leads lost, and keeps the answer on each", async () => {
    const unanswered = await bulk({ action: "status", ids: [ids.fresh, ids.called], value: "LOST" });
    expect(unanswered.status).toBe(400);
    expect((await lead(ids.fresh)).stage).toBe("NEW");

    const { status, body } = await bulk({
      action: "status",
      ids: [ids.fresh, ids.called],
      value: "LOST",
      reason: "Went with a cheaper quote",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ updated: 2, unchanged: 0, skipped: 0 });
    for (const id of [ids.fresh, ids.called]) {
      expect(await lead(id)).toMatchObject({ stage: "LOST", lostReason: "Went with a cheaper quote" });
      expect((await lead(id)).lostAt).not.toBeNull();
    }
  });

  it("moves a stage, and counts the leads already there", async () => {
    const { body } = await bulk({ action: "status", ids: [ids.fresh, ids.called], value: "CONTACTED" });
    expect(body).toMatchObject({ updated: 1, unchanged: 1 });
    expect((await lead(ids.fresh)).stage).toBe("CONTACTED");
  });

  it("makes a lead moved past Contacted a deal, as a drag on the board does", async () => {
    const { status } = await bulk({ action: "status", ids: [ids.fresh], value: "QUOTED" });
    expect(status).toBe(200);
    const moved = await lead(ids.fresh);
    expect(moved.stage).toBe("QUOTED");
    expect(moved.convertedDealId).not.toBeNull();
    expect(await prisma.crmDeal.count({ where: { companyId, id: moved.convertedDealId! } })).toBe(1);
  });

  it("assigns, and writes who to on each lead's history", async () => {
    const { body } = await bulk({ action: "assign", ids: [ids.nobodys, ids.fresh], value: rudo }, rudo, "MANAGER");
    expect(body).toMatchObject({ updated: 2 });
    expect((await lead(ids.nobodys)).assignedToId).toBe(rudo);
    const history = await prisma.crmActivity.findMany({ where: { companyId, leadId: ids.nobodys } });
    expect(history.map((entry) => entry.subject)).toEqual(["Lead assigned to rudo"]);
  });

  it("leaves another rep's leads alone, and says so", async () => {
    const { body } = await bulk({ action: "archive", ids: [ids.fresh, ids.rudos, ids.nobodys] });
    expect(body).toEqual({
      updated: 2,
      unchanged: 0,
      skipped: 1,
      notFound: 0,
      skippedReason: "they belong to someone else",
    });
    expect((await lead(ids.rudos)).archivedAt).toBeNull();
  });

  it("restores archived leads, but not one that became a deal", async () => {
    await bulk({ action: "archive", ids: [ids.fresh] });
    await bulk({ action: "status", ids: [ids.called], value: "QUALIFIED" });
    // Conversion archives the lead; the deal carries the work from there.
    expect((await lead(ids.called)).archivedAt).not.toBeNull();

    const { body } = await bulk({ action: "restore", ids: [ids.fresh, ids.called] });
    expect(body).toMatchObject({
      updated: 1,
      skipped: 1,
      skippedReason: "converted leads stay with their deal",
    });
    expect((await lead(ids.fresh)).archivedAt).toBeNull();
    expect((await lead(ids.called)).archivedAt).not.toBeNull();
  });
});
