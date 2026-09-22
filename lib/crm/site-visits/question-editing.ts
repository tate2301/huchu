/**
 * Editing a tenant's site-visit questions.
 *
 * The seeding in `question-sets.ts` puts FloorCode's 152 questions in the
 * database on first use and never touches them again. That made the questions
 * *data*; it did not make them *editable*, because nothing could write them.
 * This is the write side.
 *
 * Two rules here are not preferences, and both are enforced on the server
 * rather than by a disabled input:
 *
 *   A key is immutable once saved. `CrmSiteVisitAnswer` snapshots
 *   `questionKey` at capture and joins back on it, and the section upsert is
 *   keyed `(sectionId, questionKey)`. Renaming a key silently orphans every
 *   answer already given and makes the next offline replay create a duplicate
 *   rather than update. Somebody who genuinely wants a different key is
 *   asking for a different question, which is an archive and an add.
 *
 *   A choice question needs choices. `SINGLE_SELECT` with an empty option
 *   list renders as a row of no buttons — a question the rep cannot answer
 *   and cannot skip.
 */

import { z } from "zod";
import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const QUESTION_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "BOOLEAN",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "DATE",
  "DIMENSION",
  "PHOTO_EVIDENCE",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** What each type is called on the editing screen. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SHORT_TEXT: "Short text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  BOOLEAN: "Yes / no",
  SINGLE_SELECT: "Pick one",
  MULTI_SELECT: "Pick several",
  DATE: "Date",
  DIMENSION: "Width × height",
  PHOTO_EVIDENCE: "Photograph",
};

/** Types that render a list of buttons, and are broken without one. */
export const CHOICE_TYPES: readonly QuestionType[] = ["SINGLE_SELECT", "MULTI_SELECT"];

export function needsChoices(type: QuestionType): boolean {
  return CHOICE_TYPES.includes(type);
}

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "A key must be snake_case and start with a letter — it is what answers are stored against.",
  );

const choiceSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
});

export const questionDraftSchema = z
  .object({
    /** Absent on a question being added. Present means "update this one". */
    id: z.string().uuid().optional(),
    key: keySchema,
    label: z.string().trim().min(1).max(500),
    helpText: z.string().trim().max(1000).nullable().optional(),
    type: z.enum(QUESTION_TYPES),
    options: z.array(choiceSchema).max(60).nullable().optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    isRequired: z.boolean().default(false),
    requiresPhoto: z.boolean().default(false),
  })
  .superRefine((question, ctx) => {
    if (needsChoices(question.type) && (question.options?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `"${question.label}" asks the rep to pick from a list, so it needs at least one choice.`,
      });
    }
    const values = (question.options ?? []).map((option) => option.value);
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `"${question.label}" has two choices with the same value.`,
      });
    }
  });

export type QuestionDraft = z.infer<typeof questionDraftSchema>;

export const questionSetDraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["PRODUCT", "EVIDENCE", "CLOSEOUT"]).optional(),
  productId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  /** The whole list, in the order it should be asked. */
  questions: z.array(questionDraftSchema).max(300),
});

export const createQuestionSetSchema = z.object({
  key: keySchema,
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["PRODUCT", "EVIDENCE", "CLOSEOUT"]).default("PRODUCT"),
  productId: z.string().uuid().nullable().optional(),
});

export class QuestionEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionEditError";
  }
}

/** Two questions in one set cannot share a key; the database says so too. */
function assertUniqueKeys(questions: QuestionDraft[]): void {
  const keys = questions.map((question) => question.key);
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicate) {
    throw new QuestionEditError(
      `Two questions in this section both use the key "${duplicate}". Keys have to be unique — they are what answers are stored against.`,
    );
  }
}

/**
 * Save the whole question list for one set.
 *
 * Whole-list rather than per-question, matching the form builder: an admin
 * reorders three questions and renames a fourth in one sitting, and four
 * separate saves would leave the list in states nobody asked for if one
 * failed.
 *
 * Questions dropped from the list are *archived*, never deleted, when they
 * have been answered. An answer keeps its own snapshot of the label and type,
 * so an old report still reads correctly either way — but the definition is
 * the only place the help text and the full choice list survive, and a report
 * somebody opens in a year is worth more than a tidy table.
 */
export async function saveQuestionSet(
  tx: Tx,
  companyId: string,
  setId: string,
  draft: z.infer<typeof questionSetDraftSchema>,
) {
  const set = await tx.crmQuestionSet.findFirst({
    where: { id: setId, companyId },
    include: { questions: { where: { archivedAt: null } } },
  });
  if (!set) throw new QuestionEditError("That section no longer exists.");

  assertUniqueKeys(draft.questions);

  const existing = new Map(set.questions.map((question) => [question.id, question]));

  for (const question of draft.questions) {
    if (!question.id) continue;
    const current = existing.get(question.id);
    if (!current) {
      throw new QuestionEditError(
        "One of these questions is no longer in this section — reload and try again.",
      );
    }
    if (current.key !== question.key) {
      throw new QuestionEditError(
        `"${current.label}" cannot change its key. Answers already given are stored against "${current.key}". Archive it and add a new question instead.`,
      );
    }
  }

  await tx.crmQuestionSet.update({
    where: { id: setId },
    data: {
      name: draft.name,
      ...(draft.kind === undefined ? {} : { kind: draft.kind }),
      ...(draft.productId === undefined ? {} : { productId: draft.productId }),
      ...(draft.isActive === undefined ? {} : { isActive: draft.isActive }),
      // Once a human has edited it, it is theirs rather than the template's.
      sourceTemplateKey: null,
    },
  });

  const keptIds = new Set(draft.questions.map((question) => question.id).filter(Boolean));

  for (const question of set.questions) {
    if (keptIds.has(question.id)) continue;
    const answerCount = await tx.crmSiteVisitAnswer.count({
      where: { questionId: question.id },
    });
    if (answerCount > 0) {
      await tx.crmQuestion.update({
        where: { id: question.id },
        data: { archivedAt: new Date() },
      });
    } else {
      await tx.crmQuestion.delete({ where: { id: question.id } });
    }
  }

  for (const [position, question] of draft.questions.entries()) {
    const data = {
      label: question.label,
      helpText: question.helpText ?? null,
      type: question.type,
      options: (question.options ?? undefined) as Prisma.InputJsonValue | undefined,
      unit: question.unit ?? null,
      isRequired: question.isRequired,
      requiresPhoto: question.requiresPhoto,
      position,
      // A human has looked at it; that is exactly what the flag was asking for.
      needsReview: false,
    };

    if (question.id) {
      await tx.crmQuestion.update({ where: { id: question.id }, data });
    } else {
      await tx.crmQuestion.create({
        data: { ...data, companyId, questionSetId: setId, key: question.key },
      });
    }
  }

  return tx.crmQuestionSet.findFirst({
    where: { id: setId },
    include: {
      questions: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      product: { select: { id: true, name: true } },
    },
  });
}
