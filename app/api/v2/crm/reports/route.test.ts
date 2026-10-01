/**
 * The funnel ends at Won. Counting stages by position put Lost after Won, so
 * the report drew a "Lost" step under "Won", flagged it as where the most
 * deals were lost, and counted the lost deals parked past Won as won.
 *
 * The session is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET } = await import("./route");

const SLUG = "crm-reports-funnel-test";

let companyId: string;

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await prisma.company.create({ data: { name: SLUG, slug: SLUG } })).id;
  const manager = await prisma.user.upsert({
    where: { email: `${SLUG}-manager@example.invalid` },
    update: { companyId },
    create: { email: `${SLUG}-manager@example.invalid`, name: "Manager", companyId, role: "MANAGER" },
  });
  validateSessionMock.mockResolvedValue({
    session: { user: { id: manager.id, companyId, role: "MANAGER" } },
  });

  const pipeline = await prisma.crmPipeline.create({
    data: { companyId, name: "Sales", isDefault: true },
  });
  const stage = (name: string, position: number, status: "OPEN" | "WON" | "LOST") =>
    prisma.crmPipelineStage.create({
      data: { companyId, pipelineId: pipeline.id, name, position, status },
    });
  const discovery = await stage("Discovery", 1, "OPEN");
  const quoted = await stage("Quoted", 2, "OPEN");
  const won = await stage("Won", 3, "WON");
  const lost = await stage("Lost", 4, "LOST");

  const deal = (dealNo: string, stageId: string, closed: { wonAt?: Date; lostAt?: Date } = {}) =>
    prisma.crmDeal.create({
      data: { companyId, dealNo, title: dealNo, pipelineId: pipeline.id, stageId, ...closed },
    });
  await deal("D-1", discovery.id);
  await deal("D-2", quoted.id);
  await deal("D-3", won.id, { wonAt: new Date() });
  await deal("D-4", lost.id, { lostAt: new Date() });
  await deal("D-5", lost.id, { lostAt: new Date() });
});

afterAll(async () => {
  await prisma.crmDeal.deleteMany({ where: { companyId } });
  await prisma.crmPipelineStage.deleteMany({ where: { companyId } });
  await prisma.crmPipeline.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("the sales report's funnel", () => {
  it("ends at Won, and counts only the won deals there", async () => {
    const response = await GET(new NextRequest("http://crm.test/api/v2/crm/reports?range=30d"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      funnel: Array<{ label: string; reached: number }>;
      counts: { won: number; lost: number; open: number };
    };

    expect(body.funnel.map((stage) => stage.label)).toEqual(["Discovery", "Quoted", "Won"]);
    expect(body.funnel.at(-1)?.reached).toBe(1);
    expect(body.counts).toEqual({ won: 1, lost: 2, open: 2 });
  });
});
