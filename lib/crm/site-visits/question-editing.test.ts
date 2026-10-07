/**
 * Editing a tenant's questions, against a real database.
 *
 * The rules worth testing are the ones that protect work already captured. A
 * renamed key orphans every answer given against it; a dropped question with
 * answers behind it takes its help text and full choice list with it. Both are
 * silent at the time and only visible months later, in a report that reads
 * wrong — which is exactly the kind of failure a test has to catch instead of
 * a reviewer.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  QuestionEditError,
  needsChoices,
  questionDraftSchema,
  questionSetDraftSchema,
  saveQuestionSet,
} from "@/lib/crm/site-visits/question-editing";

const SLUG = "question-editing-test";

let companyId: string;
let setId: string;

async function seedSet() {
  await prisma.crmQuestionSet.deleteMany({ where: { companyId } });
  const set = await prisma.crmQuestionSet.create({
    data: {
      companyId,
      key: "epoxy",
      name: "Epoxy flooring",
      kind: "PRODUCT",
      sourceTemplateKey: "floorcode-flooring-v1",
      questions: {
        create: [
          { companyId, key: "damp", label: "Is there visible moisture/damp?", type: "BOOLEAN", position: 0 },
          { companyId, key: "area", label: "Floor area", type: "NUMBER", unit: "m2", position: 1 },
        ],
      },
    },
    include: { questions: { orderBy: { position: "asc" } } },
  });
  setId = set.id;
  return set;
}

function draft(questions: Array<Record<string, unknown>>) {
  return questionSetDraftSchema.parse({ name: "Epoxy flooring", questions });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Question Editing Test", slug: SLUG },
  });
  companyId = company.id;
});

beforeEach(seedSet);

afterAll(async () => {
  await prisma.crmQuestionSet.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("what a draft will accept", () => {
  it("refuses a choice question with no choices", () => {
    // It would render as a row of no buttons: unanswerable and unskippable.
    const result = questionDraftSchema.safeParse({
      key: "finish",
      label: "Which finish?",
      type: "SINGLE_SELECT",
      options: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a choice question with choices", () => {
    const result = questionDraftSchema.safeParse({
      key: "finish",
      label: "Which finish?",
      type: "SINGLE_SELECT",
      options: [{ value: "matt", label: "Matt" }],
    });
    expect(result.success).toBe(true);
  });

  it("refuses two choices sharing a value", () => {
    const result = questionDraftSchema.safeParse({
      key: "finish",
      label: "Which finish?",
      type: "MULTI_SELECT",
      options: [
        { value: "matt", label: "Matt" },
        { value: "matt", label: "Matte" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("refuses a key that is not snake_case", () => {
    // It is a storage key, not a label, and the label is free-form anyway.
    expect(
      questionDraftSchema.safeParse({ key: "Floor Area", label: "x", type: "NUMBER" }).success,
    ).toBe(false);
  });

  it("knows which types need choices", () => {
    expect(needsChoices("SINGLE_SELECT")).toBe(true);
    expect(needsChoices("MULTI_SELECT")).toBe(true);
    expect(needsChoices("BOOLEAN")).toBe(false);
    expect(needsChoices("DIMENSION")).toBe(false);
  });
});

describe("saving a section", () => {
  it("updates labels and keeps the order the admin set", async () => {
    const set = await prisma.crmQuestionSet.findFirst({
      where: { id: setId },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    const [damp, area] = set!.questions;

    const saved = await prisma.$transaction((tx) =>
      saveQuestionSet(
        tx,
        companyId,
        setId,
        draft([
          { id: area.id, key: "area", label: "Floor area in square metres", type: "NUMBER", unit: "m2" },
          { id: damp.id, key: "damp", label: "Is there visible moisture/damp?", type: "BOOLEAN" },
        ]),
      ),
    );

    expect(saved!.questions.map((question) => question.key)).toEqual(["area", "damp"]);
    expect(saved!.questions[0].label).toBe("Floor area in square metres");
  });

  it("adds a new question without an id", async () => {
    const set = await prisma.crmQuestionSet.findFirst({
      where: { id: setId },
      include: { questions: { orderBy: { position: "asc" } } },
    });

    const saved = await prisma.$transaction((tx) =>
      saveQuestionSet(
        tx,
        companyId,
        setId,
        draft([
          ...set!.questions.map((question) => ({
            id: question.id,
            key: question.key,
            label: question.label,
            type: question.type,
          })),
          {
            key: "finish",
            label: "Which finish?",
            type: "SINGLE_SELECT",
            options: [
              { value: "matt", label: "Matt" },
              { value: "gloss", label: "Gloss" },
            ],
          },
        ]),
      ),
    );

    const added = saved!.questions.find((question) => question.key === "finish");
    expect(added?.options).toEqual([
      { value: "matt", label: "Matt" },
      { value: "gloss", label: "Gloss" },
    ]);
  });

  it("refuses to rename a key", async () => {
    const set = await prisma.crmQuestionSet.findFirst({
      where: { id: setId },
      include: { questions: true },
    });
    const damp = set!.questions.find((question) => question.key === "damp")!;

    await expect(
      prisma.$transaction((tx) =>
        saveQuestionSet(
          tx,
          companyId,
          setId,
          draft([{ id: damp.id, key: "moisture", label: damp.label, type: "BOOLEAN" }]),
        ),
      ),
    ).rejects.toThrow(QuestionEditError);
  });

  it("refuses two questions with the same key", async () => {
    await expect(
      prisma.$transaction((tx) =>
        saveQuestionSet(
          tx,
          companyId,
          setId,
          draft([
            { key: "damp", label: "One", type: "BOOLEAN" },
            { key: "damp", label: "Two", type: "BOOLEAN" },
          ]),
        ),
      ),
    ).rejects.toThrow(/unique/i);
  });

  it("hands the section to the tenant once they have edited it", async () => {
    const before = await prisma.crmQuestionSet.findUnique({ where: { id: setId } });
    expect(before?.sourceTemplateKey).toBe("floorcode-flooring-v1");

    await prisma.$transaction((tx) =>
      saveQuestionSet(tx, companyId, setId, draft([])),
    );

    const after = await prisma.crmQuestionSet.findUnique({ where: { id: setId } });
    expect(after?.sourceTemplateKey).toBeNull();
  });
});

describe("removing a question", () => {
  it("deletes one nobody has answered", async () => {
    const set = await prisma.crmQuestionSet.findFirst({
      where: { id: setId },
      include: { questions: true },
    });
    const keep = set!.questions.find((question) => question.key === "damp")!;

    await prisma.$transaction((tx) =>
      saveQuestionSet(
        tx,
        companyId,
        setId,
        draft([{ id: keep.id, key: keep.key, label: keep.label, type: "BOOLEAN" }]),
      ),
    );

    expect(await prisma.crmQuestion.count({ where: { questionSetId: setId } })).toBe(1);
  });

  it("archives one that has been answered, rather than deleting it", async () => {
    // The answer keeps its own label snapshot either way, but the definition
    // is the only place the help text and full choice list survive, and a
    // report somebody opens in a year is worth more than a tidy table.
    const set = await prisma.crmQuestionSet.findFirst({
      where: { id: setId },
      include: { questions: true },
    });
    const damp = set!.questions.find((question) => question.key === "damp")!;
    const keep = set!.questions.find((question) => question.key === "area")!;

    const appointment = await prisma.crmAppointment.create({
      data: {
        companyId,
        appointmentNo: "SVT-QE-1",
        title: "Test visit",
        assignedToId: (
          await prisma.user.upsert({
            where: { email: "question-editing-test@example.invalid" },
            update: {},
            create: {
              email: "question-editing-test@example.invalid",
              name: "QE Test",
              companyId,
              role: "CLERK",
            },
          })
        ).id,
        scheduledStart: new Date("2026-05-14T09:00:00.000Z"),
      },
    });
    const section = await prisma.crmSiteVisitSection.create({
      data: { companyId, appointmentId: appointment.id, questionSetId: setId, name: "Epoxy", kind: "PRODUCT" },
    });
    await prisma.crmSiteVisitAnswer.create({
      data: {
        companyId,
        sectionId: section.id,
        questionId: damp.id,
        questionKey: damp.key,
        questionLabel: damp.label,
        questionType: "BOOLEAN",
        valueBool: true,
      },
    });

    await prisma.$transaction((tx) =>
      saveQuestionSet(
        tx,
        companyId,
        setId,
        draft([{ id: keep.id, key: keep.key, label: keep.label, type: "NUMBER" }]),
      ),
    );

    const after = await prisma.crmQuestion.findUnique({ where: { id: damp.id } });
    expect(after).not.toBeNull();
    expect(after?.archivedAt).not.toBeNull();

    // And the answer still points at it, so the old report reads whole.
    const answer = await prisma.crmSiteVisitAnswer.findFirst({
      where: { sectionId: section.id },
    });
    expect(answer?.questionId).toBe(damp.id);

    await prisma.crmSiteVisitAnswer.deleteMany({ where: { companyId } });
    await prisma.crmSiteVisitSection.deleteMany({ where: { companyId } });
    await prisma.crmAppointment.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
  });
});

/**
 * The migration witness for `20261006120000_built_site_visit_questions`, and
 * what a set built in the builder keeps: settings, measuring kinds, a quote.
 */
describe("a section built in the builder", () => {
  it("has the columns and kinds the builder writes", async () => {
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string; data_type: string }>>`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'CrmQuestion' AND column_name = 'settings') OR (table_name = 'CrmQuestionSet' AND column_name = 'quoteLines'))
    `;
    expect(columns.map((column) => column.data_type)).toEqual(["jsonb", "jsonb"]);
    const kinds = await prisma.$queryRaw<Array<{ kind: string }>>`SELECT unnest(enum_range(NULL::"CrmQuestionType"))::text AS kind`;
    expect(kinds.map((row) => row.kind)).toEqual(expect.arrayContaining(["AREAS", "READING", "RUN", "SIGNATURE", "SECTION"]));
  });

  it("keeps a measured question's settings and the quote it drafts", async () => {
    const set = await seedSet();
    await prisma.$transaction((tx) =>
      saveQuestionSet(
        tx,
        companyId,
        setId,
        questionSetDraftSchema.parse({
          name: "Epoxy flooring",
          questions: [
            { id: set.questions[0].id, key: "damp", label: "Is there visible moisture/damp?", type: "BOOLEAN" },
            { key: "areas", label: "Areas to be coated", type: "AREAS", unit: "m", isRequired: true },
            { key: "moisture", label: "Moisture reading", type: "READING", unit: "%", settings: { warnAbove: 4, showWhen: { key: "damp", op: "is", value: "true" } } },
          ],
          quoteLines: [{ id: "coat", description: "Epoxy coating", unit: "m²", unitPrice: 35, quantity: { from: "field", key: "areas", factor: 1.08 } }],
        }),
      ),
    );
    const saved = await prisma.crmQuestionSet.findUniqueOrThrow({ where: { id: setId }, include: { questions: { where: { archivedAt: null }, orderBy: { position: "asc" } } } });
    expect(saved.quoteLines).toEqual([{ id: "coat", description: "Epoxy coating", unit: "m²", unitPrice: 35, quantity: { from: "field", key: "areas", factor: 1.08 } }]);
    expect(saved.questions.map((question) => question.type)).toEqual(["BOOLEAN", "AREAS", "READING"]);
    expect(saved.questions[2].settings).toEqual({ warnAbove: 4, showWhen: { key: "damp", op: "is", value: "true" } });
  });

  it("refuses a quote line counting something that is not measured", async () => {
    const set = await seedSet();
    await expect(
      prisma.$transaction((tx) =>
        saveQuestionSet(tx, companyId, setId, questionSetDraftSchema.parse({
          name: "Epoxy flooring",
          questions: [{ id: set.questions[0].id, key: "damp", label: "Is there visible moisture/damp?", type: "BOOLEAN" }],
          quoteLines: [{ id: "coat", description: "Epoxy coating", unitPrice: 35, quantity: { from: "field", key: "damp" } }],
        })),
      ),
    ).rejects.toThrow(/not a measurement/);
  });

  it("refuses a question shown by an answer that is not on the form", async () => {
    await seedSet();
    await expect(
      prisma.$transaction((tx) =>
        saveQuestionSet(tx, companyId, setId, draft([
          { key: "moisture", label: "Moisture reading", type: "READING", settings: { showWhen: { key: "gone", op: "isAnswered" } } },
        ])),
      ),
    ).rejects.toBeInstanceOf(QuestionEditError);
  });
});
