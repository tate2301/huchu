/**
 * Raising a job, through the real handler and a real database.
 *
 * Every job delivers a deal — it is what the job is invoiced against when the
 * work is signed off — so one with no deal is refused. A deal has at most one
 * project and its jobs belong in it, so a job raised against a deal that has
 * one goes into it, on the deal's customer and site, without the raiser
 * picking the project a second time.
 *
 * Only the session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { ensureDefaultPipeline } from "@/lib/crm/pipelines";
import { projectFromDeal } from "@/lib/crm/projects";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { POST } = await import("./route");

const SLUG = "crm-job-route-test";
const EMAIL = "crm-job-route-test@example.invalid";

let companyId: string;
let userId: string;
let clientId: string;
let siteId: string;
let pipelineId: string;
let stageId: string;

async function deal(title: string) {
  return prisma.crmDeal.create({
    data: {
      companyId,
      dealNo: `DEAL-JOB-${Math.random().toString(36).slice(2, 10)}`,
      title,
      pipelineId,
      stageId,
      clientId,
      siteId,
    },
  });
}

async function raise(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://crm.test/api/v2/crm/work-orders", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
  return { status: response.status, body: await response.json() };
}

async function wipe() {
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmWorkOrder.deleteMany({ where: { companyId } });
  await prisma.crmProject.deleteMany({ where: { companyId } });
  await prisma.costCenter.deleteMany({ where: { companyId } });
  await prisma.crmDeal.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Job Route Test", slug: SLUG },
  });
  companyId = company.id;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Rudo Crew", companyId, role: "MANAGER" },
  });
  userId = user.id;
  await wipe();
  await prisma.crmSite.deleteMany({ where: { companyId } });
  await prisma.crmClient.deleteMany({ where: { companyId } });
  const client = await prisma.crmClient.create({
    data: { companyId, clientNo: `CL-JOB-${Date.now()}`, name: "Plumtree Freight" },
  });
  clientId = client.id;
  const site = await prisma.crmSite.create({
    data: { companyId, clientId, siteNo: `ST-JOB-${Date.now()}`, name: "Msasa depot" },
  });
  siteId = site.id;
  const pipeline = await prisma.$transaction((tx) => ensureDefaultPipeline(tx, companyId));
  pipelineId = pipeline.id;
  stageId = pipeline.stages[0].id;
});

beforeEach(async () => {
  await wipe();
  validateSessionMock.mockResolvedValue({
    session: { user: { id: userId, companyId, role: "MANAGER" } },
  });
});

afterAll(async () => {
  await wipe();
  await prisma.crmSite.deleteMany({ where: { companyId } });
  await prisma.crmClient.deleteMany({ where: { companyId } });
  await prisma.crmPipelineStage.deleteMany({ where: { companyId } });
  await prisma.crmPipeline.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("raising a job", () => {
  it("refuses a job with no deal behind it", async () => {
    const { status, body } = await raise({ title: "Callout", siteId });
    expect(status).toBe(400);
    expect(body.error).toBe("Choose the deal this job delivers");
    expect(await prisma.crmWorkOrder.count({ where: { companyId } })).toBe(0);
  });

  it("puts a deal's job into the deal's project, on its customer and site", async () => {
    const won = await deal("Warehouse floor");
    const project = await prisma.$transaction((tx) => projectFromDeal(tx, companyId, userId, won.id));

    const { status, body } = await raise({ title: "Day one", dealId: won.id });
    expect(status).toBe(201);
    expect(body).toMatchObject({ dealId: won.id, projectId: project.id, clientId, siteId });
  });

  it("leaves a job standing alone when its deal has no project", async () => {
    const won = await deal("Signage");
    const { status, body } = await raise({ title: "Mount the fascia", dealId: won.id });
    expect(status).toBe(201);
    expect(body).toMatchObject({ dealId: won.id, projectId: null, clientId, siteId });
  });

  it("takes the deal from the project it was raised in", async () => {
    const won = await deal("Showroom");
    const project = await prisma.$transaction((tx) => projectFromDeal(tx, companyId, userId, won.id));
    const { status, body } = await raise({ title: "Screed", projectId: project.id });
    expect(status).toBe(201);
    expect(body).toMatchObject({ dealId: won.id, projectId: project.id });
  });
});
