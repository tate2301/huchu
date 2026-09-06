import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { buildFullName, convertLead, splitName } from "./conversion";
import { ensureDefaultPipeline } from "./pipelines";

let companyId: string;
let userId: string;

beforeAll(async () => {
  await prisma.$connect();
  const suffix = `${process.pid.toString(36)}-conv`;
  const company = await prisma.company.create({
    data: { name: `CRM Conversion ${suffix}`, slug: `crm-conversion-${suffix}` },
  });
  companyId = company.id;
  const user = await prisma.user.create({
    data: {
      companyId,
      email: `crm-conversion-${suffix}@example.test`,
      name: "Conversion Tester",
      role: "MANAGER",
    },
  });
  userId = user.id;
  await prisma.$transaction((tx) => ensureDefaultPipeline(tx, companyId));
});

afterAll(async () => {
  // User is a restrict-delete parent of the CRM rows, so unwind by hand.
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmDealContact.deleteMany({ where: { companyId } });
  await prisma.crmFollowUp.deleteMany({ where: { companyId } });
  await prisma.crmAppointment.deleteMany({ where: { companyId } });
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.crmDeal.deleteMany({ where: { companyId } });
  await prisma.crmPerson.deleteMany({ where: { companyId } });
  await prisma.crmClient.deleteMany({ where: { companyId } });
  await prisma.crmPipelineStage.deleteMany({ where: { companyId } });
  await prisma.crmPipeline.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

async function createLead(overrides: Record<string, unknown> = {}) {
  const leadNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_LEAD" });
  return prisma.crmLead.create({
    data: {
      companyId,
      leadNo,
      title: "Warehouse roof",
      contactName: "John Moyo",
      contactEmail: "john@delta.test",
      contactPhone: "0771234567",
      estimatedValue: 5000,
      source: "Referral",
      services: ["Roofing"],
      createdById: userId,
      ...overrides,
    },
  });
}

describe("splitName", () => {
  it("splits a two-part name", () => {
    expect(splitName("John Moyo")).toEqual({ firstName: "John", lastName: "Moyo" });
  });

  it("treats a middle name as part of the first name", () => {
    expect(splitName("Anna Maria Dube")).toEqual({ firstName: "Anna Maria", lastName: "Dube" });
  });

  it("keeps a single word whole", () => {
    expect(splitName("Tapiwa")).toEqual({ firstName: "Tapiwa", lastName: null });
  });

  it("falls back rather than producing an empty name", () => {
    expect(splitName("   ")).toEqual({ firstName: "Unnamed", lastName: null });
  });
});

describe("buildFullName", () => {
  it("joins the halves and drops a missing surname", () => {
    expect(buildFullName("John", "Moyo")).toBe("John Moyo");
    expect(buildFullName("Tapiwa", null)).toBe("Tapiwa");
  });
});

describe("convertLead", () => {
  it("creates a person, a company and a deal from one lead", async () => {
    const lead = await createLead();

    const result = await prisma.$transaction((tx) =>
      convertLead(tx, {
        companyId,
        userId,
        leadId: lead.id,
        input: {
          dealTitle: "Warehouse roof replacement",
          createCompany: true,
          companyName: "Delta Interiors",
        },
      }),
    );

    expect(result.createdPerson).toBe(true);
    expect(result.createdCompany).toBe(true);
    expect(result.dealNo).toMatch(/^CRMD-\d{4}$/);

    const person = await prisma.crmPerson.findUniqueOrThrow({ where: { id: result.personId! } });
    expect(person.fullName).toBe("John Moyo");
    expect(person.sourceType).toBe("LEAD_CONVERSION");
    expect(person.convertedFromLeadId).toBe(lead.id);

    const deal = await prisma.crmDeal.findUniqueOrThrow({
      where: { id: result.dealId },
      include: { contacts: true, stage: true },
    });
    // Attribution and value carry across — it is the same opportunity.
    expect(deal.value).toBe(5000);
    expect(deal.source).toBe("Referral");
    expect(deal.services).toEqual(["Roofing"]);
    expect(deal.stage.status).toBe("OPEN");
    expect(deal.contacts).toHaveLength(1);
    expect(deal.contacts[0].role).toBe("PRIMARY");
  });

  it("marks the lead converted and keeps the link back", async () => {
    const lead = await createLead({ contactEmail: "b@delta.test" });
    const result = await prisma.$transaction((tx) =>
      convertLead(tx, { companyId, userId, leadId: lead.id, input: { dealTitle: "Second job" } }),
    );

    const after = await prisma.crmLead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.convertedAt).toBeInstanceOf(Date);
    expect(after.convertedDealId).toBe(result.dealId);
    expect(after.convertedById).toBe(userId);
  });

  it("refuses to convert the same lead twice", async () => {
    const lead = await createLead({ contactEmail: "c@delta.test" });
    await prisma.$transaction((tx) =>
      convertLead(tx, { companyId, userId, leadId: lead.id, input: { dealTitle: "First" } }),
    );

    await expect(
      prisma.$transaction((tx) =>
        convertLead(tx, { companyId, userId, leadId: lead.id, input: { dealTitle: "Again" } }),
      ),
    ).rejects.toThrow(/already been converted/);
  });

  it("re-points history onto the deal instead of copying it", async () => {
    const lead = await createLead({ contactEmail: "d@delta.test" });
    await prisma.crmActivity.create({
      data: { companyId, type: "CALL", leadId: lead.id, subject: "Discovery call", createdById: userId },
    });
    await prisma.crmFollowUp.create({
      data: {
        companyId,
        leadId: lead.id,
        title: "Send brochure",
        dueAt: new Date(Date.now() + 86_400_000),
        assignedToId: userId,
      },
    });

    const result = await prisma.$transaction((tx) =>
      convertLead(tx, { companyId, userId, leadId: lead.id, input: { dealTitle: "Carried over" } }),
    );

    const call = await prisma.crmActivity.findFirstOrThrow({
      where: { companyId, subject: "Discovery call" },
    });
    expect(call.dealId).toBe(result.dealId);
    // The same row, not a copy — the lead link is kept for provenance.
    expect(call.leadId).toBe(lead.id);

    const task = await prisma.crmFollowUp.findFirstOrThrow({
      where: { companyId, title: "Send brochure" },
    });
    expect(task.dealId).toBe(result.dealId);

    const calls = await prisma.crmActivity.count({
      where: { companyId, subject: "Discovery call" },
    });
    expect(calls).toBe(1);
  });

  it("reuses an existing person rather than minting a second one", async () => {
    const personNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_PERSON" });
    const existing = await prisma.crmPerson.create({
      data: { companyId, personNo, firstName: "Rudo", fullName: "Rudo Ncube" },
    });
    const lead = await createLead({ contactName: "Rudo Ncube", contactEmail: "rudo@delta.test" });

    const result = await prisma.$transaction((tx) =>
      convertLead(tx, {
        companyId,
        userId,
        leadId: lead.id,
        input: { dealTitle: "Repeat business", personId: existing.id },
      }),
    );

    expect(result.personId).toBe(existing.id);
    expect(result.createdPerson).toBe(false);
  });

  it("logs the conversion on the timeline", async () => {
    const lead = await createLead({ contactEmail: "e@delta.test" });
    const result = await prisma.$transaction((tx) =>
      convertLead(tx, { companyId, userId, leadId: lead.id, input: { dealTitle: "Logged" } }),
    );

    const entry = await prisma.crmActivity.findFirstOrThrow({
      where: { companyId, dealId: result.dealId, type: "SYSTEM" },
    });
    expect(entry.subject).toContain("converted to deal");
  });
});
