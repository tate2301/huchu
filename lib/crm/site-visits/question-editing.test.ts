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
