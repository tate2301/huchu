/**
 * The project spine — deal -> project -> jobs — against a real database.
 *
 * Two promises are pinned here. Starting a deal's project twice gives back the
 * one project rather than two, because two projects on a deal split its costs
 * and neither figure is true. And a job raised inside a project lands on the
 * project's deal, customer and site, because that is what makes it billable
 * against the deal and visible on the customer's record.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { ensureDefaultPipeline } from "@/lib/crm/pipelines";
import {
  ProjectLinkError,
  createProject,
  jobLinksFromProject,
  overBudgetProjectIds,
  projectFromDeal,
} from "@/lib/crm/projects";
import { addCostEntry } from "@/lib/crm/daily-log";

const SLUG = "project-spine-test";
const OTHER_SLUG = "project-spine-other-test";
const EMAIL = "project-spine-test@example.invalid";

let companyId: string;
let otherCompanyId: string;
let userId: string;
let clientId: string;
let siteId: string;
let pipelineId: string;
let stageId: string;

let dealCounter = 0;

async function deal(overrides: { companyId?: string; value?: number | null } = {}) {
  dealCounter += 1;
  const owner = overrides.companyId ?? companyId;
  return prisma.crmDeal.create({
    data: {
      companyId: owner,
      dealNo: `DEAL-SPINE-${dealCounter}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Warehouse floor ${dealCounter}`,
      pipelineId,
      stageId,
      clientId: owner === companyId ? clientId : null,
      siteId: owner === companyId ? siteId : null,
      assignedToId: owner === companyId ? userId : null,
      value: overrides.value === undefined ? 9800 : overrides.value,
      currency: "ZWG",
    },
  });
}

async function wipe(id: string) {
  await prisma.crmDailyCostEntry.deleteMany({ where: { companyId: id } });
  await prisma.crmDailyLog.deleteMany({ where: { companyId: id } });
  await prisma.crmWorkOrder.deleteMany({ where: { companyId: id } });
  await prisma.crmProject.deleteMany({ where: { companyId: id } });
  await prisma.costCenter.deleteMany({ where: { companyId: id } });
  await prisma.crmDeal.deleteMany({ where: { companyId: id } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Project Spine Test", slug: SLUG },
  });
  companyId = company.id;
  const other = await prisma.company.upsert({
    where: { slug: OTHER_SLUG },
    update: {},
    create: { name: "Somebody Else", slug: OTHER_SLUG },
  });
  otherCompanyId = other.id;

  await wipe(companyId);
  await wipe(otherCompanyId);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Rudo Owner", companyId, role: "SALES_REP" },
  });
  userId = user.id;

  const client = await prisma.crmClient.create({
    data: { companyId, clientNo: `CL-SPINE-${Date.now()}`, name: "Plumtree Freight" },
  });
  clientId = client.id;
  const site = await prisma.crmSite.create({
    data: { companyId, clientId, siteNo: `ST-SPINE-${Date.now()}`, name: "Msasa depot" },
  });
  siteId = site.id;

  const pipeline = await prisma.$transaction((tx) => ensureDefaultPipeline(tx, companyId));
  pipelineId = pipeline.id;
  stageId = pipeline.stages[0].id;
  // The other tenant's deal needs a pipeline of its own tenant's.
  await prisma.$transaction((tx) => ensureDefaultPipeline(tx, otherCompanyId));
});

afterAll(async () => {
  await wipe(companyId);
  await wipe(otherCompanyId);
  await prisma.crmSite.deleteMany({ where: { companyId } });
  await prisma.crmClient.deleteMany({ where: { companyId } });
  await prisma.crmPipelineStage.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.crmPipeline.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
});

describe("starting a deal's project", () => {
  it("carries the deal's name, customer, site, owner and currency across", async () => {
    const won = await deal();
    const project = await prisma.$transaction((tx) =>
      projectFromDeal(tx, companyId, userId, won.id),
    );

    expect(project.dealId).toBe(won.id);
    expect(project.name).toBe(won.title);
    expect(project.clientId).toBe(clientId);
    expect(project.siteId).toBe(siteId);
    expect(project.managerId).toBe(userId);
    expect(project.currency).toBe("ZWG");
    // The deal's value stays on the deal, where the project reads it from.
    expect(project.budget).toBeNull();
  });

  it("is idempotent on the deal: a second start hands back the same project", async () => {
    const won = await deal();
    const first = await prisma.$transaction((tx) => projectFromDeal(tx, companyId, userId, won.id));
    const second = await prisma.$transaction((tx) =>
      projectFromDeal(tx, companyId, userId, won.id, { name: "A different name" }),
    );

    expect(second.id).toBe(first.id);
    expect(second.name).toBe(first.name);
    expect(await prisma.crmProject.count({ where: { companyId, dealId: won.id } })).toBe(1);
  });

  it("lets the sheet's answers win, but never lets them move the project off its deal", async () => {
    const won = await deal();
    const other = await deal();
    const project = await prisma.$transaction((tx) =>
      projectFromDeal(tx, companyId, userId, won.id, {
        name: "Phase one",
        budget: 4200,
        managerId: null,
        dealId: other.id,
      }),
    );

    expect(project.name).toBe("Phase one");
    expect(project.budget?.toString()).toBe("4200");
    // "Nobody owns it" is an answer, and it is kept.
    expect(project.managerId).toBeNull();
    expect(project.dealId).toBe(won.id);
  });

  it("does not fill a field the sheet left out with nothing", async () => {
    const won = await deal();
    const project = await prisma.$transaction((tx) =>
      projectFromDeal(tx, companyId, userId, won.id, { name: "Named", clientId: undefined }),
    );
    expect(project.clientId).toBe(clientId);
  });

  it("refuses another company's deal", async () => {
    const theirs = await deal({ companyId: otherCompanyId });
    await expect(
      prisma.$transaction((tx) => projectFromDeal(tx, companyId, userId, theirs.id)),
    ).rejects.toBeInstanceOf(ProjectLinkError);
  });

  it("is held to one project per deal by the database, not only by the check", async () => {
    // Two requests that both looked before either wrote get past the check;
    // the unique on (companyId, dealId) is what stops the second insert.
    const won = await deal();
    await prisma.$transaction((tx) =>
      createProject(tx, companyId, userId, { name: "First", dealId: won.id }),
    );
    await expect(
      prisma.$transaction((tx) =>
        createProject(tx, companyId, userId, { name: "Second", dealId: won.id }),
      ),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows any number of projects with no deal behind them", async () => {
    await prisma.$transaction((tx) => createProject(tx, companyId, userId, { name: "Direct one" }));
    await prisma.$transaction((tx) => createProject(tx, companyId, userId, { name: "Direct two" }));
    expect(
      await prisma.crmProject.count({ where: { companyId, dealId: null, name: { startsWith: "Direct" } } }),
    ).toBe(2);
  });
});

describe("a job raised inside a project", () => {
  it("inherits the project's deal, customer and site", async () => {
    const won = await deal();
    const project = await prisma.$transaction((tx) => projectFromDeal(tx, companyId, userId, won.id));

    const links = await jobLinksFromProject(prisma, companyId, project.id, {});

    expect(links).toEqual({ projectId: project.id, dealId: won.id, clientId, siteId });
  });

  it("keeps whatever the request did say", async () => {
    const won = await deal();
    const project = await prisma.$transaction((tx) => projectFromDeal(tx, companyId, userId, won.id));
    const otherSite = await prisma.crmSite.create({
      data: { companyId, clientId, siteNo: `ST-SPINE-2-${Date.now()}`, name: "Southerton yard" },
    });

    const links = await jobLinksFromProject(prisma, companyId, project.id, {
      dealId: won.id,
      siteId: otherSite.id,
    });

    expect(links.siteId).toBe(otherSite.id);
    expect(links.dealId).toBe(won.id);
  });

  it("refuses a deal the project does not belong to", async () => {
    const won = await deal();
    const elsewhere = await deal();
    const project = await prisma.$transaction((tx) => projectFromDeal(tx, companyId, userId, won.id));

    await expect(
      jobLinksFromProject(prisma, companyId, project.id, { dealId: elsewhere.id }),
    ).rejects.toThrow("That project belongs to a different deal");
  });

  it("refuses another company's project", async () => {
    const theirs = await prisma.$transaction((tx) =>
      createProject(tx, otherCompanyId, null, { name: "Not yours" }),
    );
    await expect(jobLinksFromProject(prisma, companyId, theirs.id, {})).rejects.toBeInstanceOf(
      ProjectLinkError,
    );
  });

  it("stays on the project it was raised in", async () => {
    const won = await deal();
    const project = await prisma.$transaction((tx) => projectFromDeal(tx, companyId, userId, won.id));
    const links = await jobLinksFromProject(prisma, companyId, project.id, {});

    const job = await prisma.crmWorkOrder.create({
      data: { companyId, workOrderNo: `J-SPINE-${Date.now()}`, title: "Day one", ...links },
    });

    const withJobs = await prisma.crmProject.findUniqueOrThrow({
      where: { id: project.id },
      include: { workOrders: { select: { id: true } } },
    });
    expect(withJobs.workOrders.map((row) => row.id)).toEqual([job.id]);
  });
});

describe("over budget", () => {
  it("finds a project whose spend has passed its budget, and only that one", async () => {
    const over = await prisma.$transaction((tx) =>
      createProject(tx, companyId, userId, { name: "Over", budget: 100 }),
    );
    const under = await prisma.$transaction((tx) =>
      createProject(tx, companyId, userId, { name: "Under", budget: 1000 }),
    );
    const unbudgeted = await prisma.$transaction((tx) =>
      createProject(tx, companyId, userId, { name: "No budget" }),
    );

    for (const [projectId, amount] of [
      [over.id, 150],
      [under.id, 150],
      [unbudgeted.id, 5000],
    ] as const) {
      await prisma.$transaction((tx) =>
        addCostEntry(tx, {
          companyId,
          userId,
          direction: "SPENT",
          category: "MATERIALS",
          amount,
          currency: "USD",
          description: "Screed",
          projectId,
        }),
      );
    }
    // Money received against a project is not spend against its budget.
    await prisma.$transaction((tx) =>
      addCostEntry(tx, {
        companyId,
        userId,
        direction: "RECEIVED",
        category: "OTHER",
        amount: 900,
        currency: "USD",
        description: "Deposit",
        projectId: under.id,
      }),
    );

    const ids = await overBudgetProjectIds(prisma, companyId);
    expect(ids).toContain(over.id);
    expect(ids).not.toContain(under.id);
    // A project nobody budgeted is not over a budget.
    expect(ids).not.toContain(unbudgeted.id);
  });
});
