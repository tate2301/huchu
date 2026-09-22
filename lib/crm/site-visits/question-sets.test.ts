/**
 * Seeding a tenant's question sets, against a real database.
 *
 * The thing worth asserting is not that the code runs — it is that FloorCode's
 * own questions, the ones from their .docx, are the ones a rep is asked. The
 * bank shipped as a file weeks before anything read it, and the product went
 * on showing eight generic checkboxes the whole time. These tests fail if that
 * happens again.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { FLOORCODE_QUESTION_BANK } from "@/lib/crm/site-visits/floorcode-question-bank";
import {
  FLOORCODE_TEMPLATE_KEY,
  GENERIC_TEMPLATE_KEY,
  ensureSiteVisitQuestionSets,
  matchProductId,
  questionSetsForVisit,
} from "@/lib/crm/site-visits/question-sets";

const FLOORCODE_SLUG = "question-sets-test-floorcode";
const GENERIC_SLUG = "question-sets-test-generic";

let floorcodeId: string;
let genericId: string;

async function makeCompany(slug: string, name: string) {
  const company = await prisma.company.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
  await prisma.crmQuestionSet.deleteMany({ where: { companyId: company.id } });
  return company.id;
}

beforeAll(async () => {
  floorcodeId = await makeCompany(FLOORCODE_SLUG, "Question Sets Test Floorcode");
  genericId = await makeCompany(GENERIC_SLUG, "Question Sets Test Generic");

  // A catalogue to match product sections against.
  await prisma.product.deleteMany({ where: { companyId: floorcodeId } });
  await prisma.product.createMany({
    data: [
      { companyId: floorcodeId, code: "EPOXY", name: "Epoxy Flooring" },
      { companyId: floorcodeId, code: "MATS", name: "Branded Mats" },
    ],
  });

  await prisma.$transaction(async (tx) => {
    await ensureSiteVisitQuestionSets(tx, floorcodeId, FLOORCODE_TEMPLATE_KEY);
  });
  await prisma.$transaction(async (tx) => {
    await ensureSiteVisitQuestionSets(tx, genericId, GENERIC_TEMPLATE_KEY);
  });
});

afterAll(async () => {
  for (const companyId of [floorcodeId, genericId]) {
    await prisma.crmQuestionSet.deleteMany({ where: { companyId } });
    await prisma.product.deleteMany({ where: { companyId } });
  }
  await prisma.company.deleteMany({
    where: { slug: { in: [FLOORCODE_SLUG, GENERIC_SLUG] } },
  });
});

describe("the FloorCode bank reaches the database", () => {
  it("seeds every section the .docx contains", async () => {
    const sets = await prisma.crmQuestionSet.findMany({ where: { companyId: floorcodeId } });
    expect(sets).toHaveLength(FLOORCODE_QUESTION_BANK.length);
  });

  it("seeds every question, none dropped", async () => {
    const expected = FLOORCODE_QUESTION_BANK.reduce(
      (total, section) => total + section.questions.length,
      0,
    );
    const count = await prisma.crmQuestion.count({ where: { companyId: floorcodeId } });
    expect(count).toBe(expected);
    // The number in the client's document. If this moves, somebody edited the
    // generated bank by hand instead of re-running the sync script.
    expect(expected).toBe(152);
  });

  it("keeps the client's wording exactly", async () => {
    const epoxy = await prisma.crmQuestionSet.findFirst({
      where: { companyId: floorcodeId, key: "epoxy_flooring" },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    expect(epoxy).not.toBeNull();
    const labels = epoxy!.questions.map((question) => question.label);
    expect(labels).toContain("Is there visible moisture/damp?");
    expect(labels).toContain("Will grinding, scarification or shot blasting be required?");
  });

  it("carries the options the document lists", async () => {
    const turf = await prisma.crmQuestion.findFirst({
      where: { companyId: floorcodeId, label: { contains: "turf height" } },
    });
    expect(turf?.type).toBe("SINGLE_SELECT");
    expect(turf?.options).toEqual([
      { value: "15", label: "15" },
      { value: "20", label: "20" },
      { value: "25", label: "25" },
      { value: "30", label: "30" },
      { value: "40", label: "40" },
    ]);
  });

  it("marks the photo checklist as needing photographs", async () => {
    const evidence = await prisma.crmQuestionSet.findFirst({
      where: { companyId: floorcodeId, kind: "EVIDENCE" },
      include: { questions: true },
    });
    expect(evidence!.questions.length).toBeGreaterThan(0);
    expect(evidence!.questions.every((question) => question.requiresPhoto)).toBe(true);
  });

  it("flags the questions whose type was a judgement call", async () => {
    // 25 of them, per the generator. They are the yes/no guesses on questions
    // that list alternatives — somebody should look, but capture is not blocked.
    const flagged = await prisma.crmQuestion.count({
      where: { companyId: floorcodeId, needsReview: true },
    });
    expect(flagged).toBeGreaterThan(0);
  });

  it("attaches product sections to the catalogue where it can", async () => {
    const epoxy = await prisma.crmQuestionSet.findFirst({
      where: { companyId: floorcodeId, key: "epoxy_flooring" },
      include: { product: true },
    });
    expect(epoxy?.product?.name).toBe("Epoxy Flooring");
  });

  it("still seeds a section whose product is not in the catalogue yet", async () => {
    // Refusing to seed a question because the catalogue is incomplete would
    // make the feature useless on day one.
    const cladding = await prisma.crmQuestionSet.findFirst({
      where: { companyId: floorcodeId, key: "wall_cladding" },
    });
    expect(cladding).not.toBeNull();
    expect(cladding!.productId).toBeNull();
  });
});

describe("seeding is safe to call repeatedly", () => {
  it("does not duplicate or overwrite on a second call", async () => {
    const before = await prisma.crmQuestion.count({ where: { companyId: floorcodeId } });

    // Simulate somebody having edited a seeded question.
    const first = await prisma.crmQuestion.findFirst({ where: { companyId: floorcodeId } });
    await prisma.crmQuestion.update({
      where: { id: first!.id },
      data: { label: "Edited by the tenant" },
    });

    await prisma.$transaction(async (tx) => {
      await ensureSiteVisitQuestionSets(tx, floorcodeId, FLOORCODE_TEMPLATE_KEY);
    });

    expect(await prisma.crmQuestion.count({ where: { companyId: floorcodeId } })).toBe(before);
    const after = await prisma.crmQuestion.findUnique({ where: { id: first!.id } });
    expect(after?.label).toBe("Edited by the tenant");

    await prisma.crmQuestion.update({ where: { id: first!.id }, data: { label: first!.label } });
  });
});

describe("other tenants are unaffected", () => {
  it("gives a non-FloorCode tenant the checklist it always had", async () => {
    const sets = await prisma.crmQuestionSet.findMany({
      where: { companyId: genericId },
      include: { questions: true },
    });
    expect(sets).toHaveLength(1);
    expect(sets[0].kind).toBe("CLOSEOUT");
    expect(sets[0].questions.map((question) => question.label)).toContain(
      "Site access confirmed",
    );
  });
});

describe("questionSetsForVisit", () => {
  it("splits the sets by what they are for", async () => {
    const sets = await prisma.$transaction((tx) => questionSetsForVisit(tx, floorcodeId));
    expect(sets.product).toHaveLength(11);
    expect(sets.evidence).toHaveLength(1);
    expect(sets.closeout).toHaveLength(1);
  });
});

describe("matchProductId", () => {
  const products = [
    { id: "p-epoxy", name: "Epoxy Flooring" },
    { id: "p-mats", name: "Branded Mats" },
  ];

  it("strips the document's numbering before matching", () => {
    expect(matchProductId("8. EPOXY FLOORING", products)).toBe("p-epoxy");
  });

  it("matches a section whose name carries an alias", () => {
    expect(matchProductId("1. BRANDED MATS / CUSTOM LOGO MATS", products)).toBe("p-mats");
  });

  it("returns null rather than guessing", () => {
    expect(matchProductId("11. WALL CLADDING", products)).toBeNull();
  });
});
