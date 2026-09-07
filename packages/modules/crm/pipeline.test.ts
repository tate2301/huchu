import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { changeLeadStage, stagePromotesToDeal } from "./pipeline";

let companyId: string;
let userId: string;

beforeAll(async () => {
  await prisma.$connect();
  const suffix = process.pid.toString(36);
  const company = await prisma.company.create({
    data: { name: `CRM Pipeline Test ${suffix}`, slug: `crm-pipeline-test-${suffix}` },
  });
  companyId = company.id;
  const user = await prisma.user.create({
    data: {
      companyId,
      email: `crm-pipeline-${suffix}@example.test`,
      name: "Pipeline Tester",
      role: "MANAGER",
    },
  });
  userId = user.id;
});

afterAll(async () => {
  // User is a restrict-delete parent of the CRM rows, so unwind by hand
  // rather than relying on the company cascade.
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  // Deals now exist, created by the promotion, and a lead points at one.
  await prisma.crmLead.updateMany({ where: { companyId }, data: { convertedDealId: null } });
  await prisma.crmDeal.deleteMany({ where: { companyId } });
  await prisma.crmPipelineStage.deleteMany({ where: { pipeline: { companyId } } });
  await prisma.crmPipeline.deleteMany({ where: { companyId } });
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

async function createLead(stage: "NEW" | "QUOTED" = "NEW") {
  const leadNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_LEAD" });
  return prisma.crmLead.create({
    data: { companyId, leadNo, title: "Test lead", stage, createdById: userId },
    // The promotion path reads these; selecting them here keeps the test
    // calling `changeLeadStage` with the same shape the routes pass.
    select: {
      id: true,
      stage: true,
      clientId: true,
      convertedDealId: true,
      leadNo: true,
      title: true,
      estimatedValue: true,
      currency: true,
      assignedToId: true,
    },
  });
}

describe("changeLeadStage", () => {
  it("moves the lead and logs a STAGE_CHANGE activity", async () => {
    const lead = await createLead();

    const updated = await prisma.$transaction((tx) =>
      changeLeadStage(tx, { companyId, userId, lead, stage: "CONTACTED" }),
    );

    expect(updated.stage).toBe("CONTACTED");
    expect(updated.probability).toBe(20);

    const activity = await prisma.crmActivity.findFirst({
      where: { leadId: lead.id, type: "STAGE_CHANGE" },
    });
    expect(activity?.subject).toBe("Stage changed New → Contacted");
    expect(activity?.metadata).toMatchObject({ fromStage: "NEW", toStage: "CONTACTED" });
  });

  it("stamps wonAt when the lead is won", async () => {
    const lead = await createLead();
    const updated = await prisma.$transaction((tx) =>
      changeLeadStage(tx, { companyId, userId, lead, stage: "WON" }),
    );
    expect(updated.wonAt).toBeInstanceOf(Date);
    expect(updated.lostAt).toBeNull();
    expect(updated.probability).toBe(100);
  });

  it("records the lost reason and clears it again on reopen", async () => {
    const lead = await createLead();

    const lost = await prisma.$transaction((tx) =>
      changeLeadStage(tx, {
        companyId,
        userId,
        lead,
        stage: "LOST",
        lostReason: "Went with a cheaper quote",
      }),
    );
    expect(lost.lostReason).toBe("Went with a cheaper quote");
    expect(lost.lostAt).toBeInstanceOf(Date);

    const reopened = await prisma.$transaction((tx) =>
      changeLeadStage(tx, {
        companyId,
        userId,
        lead: { id: lead.id, stage: "LOST", clientId: null },
        stage: "CONTACTED",
      }),
    );
    // A reopened lead must not keep contradictory terminal state.
    expect(reopened.lostReason).toBeNull();
    expect(reopened.lostAt).toBeNull();
    expect(reopened.wonAt).toBeNull();
  });
});

describe("sales document numbering", () => {
  it("issues sequential, padded numbers per entity", async () => {
    const first = await reserveIdentifier(prisma, { companyId, entity: "SALES_QUOTATION" });
    const second = await reserveIdentifier(prisma, { companyId, entity: "SALES_QUOTATION" });

    expect(first).toBe("QTN-0001");
    expect(second).toBe("QTN-0002");
  });

  it("keeps separate counters for quotations, invoices and receipts", async () => {
    const invoice = await reserveIdentifier(prisma, { companyId, entity: "SALES_INVOICE" });
    const receipt = await reserveIdentifier(prisma, { companyId, entity: "SALES_RECEIPT" });

    expect(invoice).toBe("INV-0001");
    expect(receipt).toBe("REC-0001");
  });

  it("ignores legacy timestamp-style numbers when seeding a counter", async () => {
    const suffix = `${process.pid.toString(36)}-legacy`;
    const other = await prisma.company.create({
      data: { name: `CRM Legacy ${suffix}`, slug: `crm-legacy-${suffix}` },
    });
    const customer = await prisma.customer.create({
      data: { companyId: other.id, name: "Legacy customer" },
    });
    // A document numbered the old way must not push the new sequence forward.
    await prisma.salesQuotation.create({
      data: {
        companyId: other.id,
        customerId: customer.id,
        quotationNumber: "QTN-20260101-1201-483",
        quotationDate: new Date(),
        subTotal: 0,
        taxTotal: 0,
        total: 0,
      },
    });

    const next = await reserveIdentifier(prisma, {
      companyId: other.id,
      entity: "SALES_QUOTATION",
    });
    expect(next).toBe("QTN-0001");

    await prisma.company.delete({ where: { id: other.id } });
  });
});

describe("stagePromotesToDeal", () => {
  it("is false up to and including Contacted", () => {
    expect(stagePromotesToDeal("NEW")).toBe(false);
    expect(stagePromotesToDeal("CONTACTED")).toBe(false);
  });

  it("is true for every stage past Contacted", () => {
    expect(stagePromotesToDeal("QUALIFIED")).toBe(true);
    expect(stagePromotesToDeal("SITE_VISIT")).toBe(true);
    expect(stagePromotesToDeal("QUOTED")).toBe(true);
    expect(stagePromotesToDeal("INVOICED")).toBe(true);
    expect(stagePromotesToDeal("WON")).toBe(true);
  });

  it("is false for Lost", () => {
    // An enquiry that died before it was ever qualified was never an
    // opportunity; inventing a deal to lose inflates every funnel it lands in.
    expect(stagePromotesToDeal("LOST")).toBe(false);
  });
});

describe("promotion to a deal", () => {
  it("creates a deal when a lead moves past Contacted", async () => {
    const lead = await createLead();

    const updated = await prisma.$transaction((tx) =>
      changeLeadStage(tx, { companyId, userId, lead, stage: "QUALIFIED" }),
    );

    expect(updated.promotedDealId).toBeTruthy();
    const deal = await prisma.crmDeal.findUnique({
      where: { id: updated.promotedDealId as string },
    });
    expect(deal?.title).toBe("Test lead");
  });

  it("lands on the stage asked for, not the one conversion leaves behind", async () => {
    const lead = await createLead();

    // `convertLead` finishes by setting the lead to QUALIFIED. Converting
    // after the stage update would drag this back a stage.
    const updated = await prisma.$transaction((tx) =>
      changeLeadStage(tx, { companyId, userId, lead, stage: "QUOTED" }),
    );

    expect(updated.stage).toBe("QUOTED");
    expect(updated.promotedDealId).toBeTruthy();
  });

  it("does not create a second deal on a later move", async () => {
    const lead = await createLead();

    const first = await prisma.$transaction((tx) =>
      changeLeadStage(tx, { companyId, userId, lead, stage: "QUALIFIED" }),
    );
    const second = await prisma.$transaction((tx) =>
      changeLeadStage(tx, {
        companyId,
        userId,
        lead: { ...lead, stage: "QUALIFIED", convertedDealId: first.promotedDealId },
        stage: "QUOTED",
      }),
    );

    expect(second.promotedDealId).toBeNull();
    const deals = await prisma.crmDeal.count({ where: { convertedFromLeadId: lead.id } });
    expect(deals).toBe(1);
  });

  it("creates no deal when a lead is lost", async () => {
    const lead = await createLead();

    const updated = await prisma.$transaction((tx) =>
      changeLeadStage(tx, { companyId, userId, lead, stage: "LOST", lostReason: "Too dear" }),
    );

    expect(updated.promotedDealId).toBeNull();
  });
});
