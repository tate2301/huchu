/**
 * Starting a project, through the real handler and a real database.
 *
 * A project is what a deal turns into, so one with no deal is refused with a
 * reason somebody can act on. A deal has one project: asked to start it a
 * second time, the route answers with the one it has and says it did not
 * start another, so the page can say so rather than announce a start.
 *
 * Only the session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { ensureDefaultPipeline } from "@/lib/crm/pipelines";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { POST } = await import("./route");

const SLUG = "crm-project-route-test";
const EMAIL = "crm-project-route-test@example.invalid";

let companyId: string;
let userId: string;
let dealId: string;

async function start(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://crm.test/api/v2/crm/projects", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
  return { status: response.status, body: await response.json() };
}

async function wipe() {
  await prisma.crmProject.deleteMany({ where: { companyId } });
  await prisma.costCenter.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Project Route Test", slug: SLUG },
  });
  companyId = company.id;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Rudo Owner", companyId, role: "MANAGER" },
  });
  userId = user.id;
  await wipe();
  await prisma.crmDeal.deleteMany({ where: { companyId } });
  const pipeline = await prisma.$transaction((tx) => ensureDefaultPipeline(tx, companyId));
  const deal = await prisma.crmDeal.create({
    data: {
      companyId,
      dealNo: "DEAL-PRJ-ROUTE-1",
      title: "Warehouse floor",
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      assignedToId: userId,
    },
  });
  dealId = deal.id;
});

beforeEach(async () => {
  await wipe();
  validateSessionMock.mockResolvedValue({
    session: { user: { id: userId, companyId, role: "MANAGER" } },
  });
});

afterAll(async () => {
  await wipe();
  await prisma.crmDeal.deleteMany({ where: { companyId } });
  await prisma.crmPipelineStage.deleteMany({ where: { companyId } });
  await prisma.crmPipeline.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("starting a project", () => {
  it("refuses one with no deal behind it", async () => {
    const { status, body } = await start({ name: "Warehouse floor" });
    expect(status).toBe(400);
    expect(body.error).toBe("Choose the deal this project delivers");
    expect(await prisma.crmProject.count({ where: { companyId } })).toBe(0);
  });

  it("starts the deal's project, named after the deal and owned by its owner", async () => {
    const { status, body } = await start({ dealId });
    expect(status).toBe(201);
    expect(body.created).toBe(true);
    expect(body.project).toMatchObject({ dealId, name: "Warehouse floor", managerId: userId });
  });

  it("answers a second start with the project the deal already has", async () => {
    const first = await start({ dealId });
    const second = await start({ dealId, name: "Another go" });
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.project.id).toBe(first.body.project.id);
    expect(await prisma.crmProject.count({ where: { companyId } })).toBe(1);
  });
});
