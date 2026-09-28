/**
 * Saving what a rep answered on site.
 *
 * Two properties drive the shape of this module, and both come from where the
 * work happens: a phone, in a warehouse, on a connection that may not be there.
 *
 *  1. Every write is an upsert keyed on something the device generated, so a
 *     queued operation replayed after signal returns updates the same row
 *     rather than creating a second one. The database enforces it too —
 *     `@@unique([sectionId, questionKey])` — because a retry loop that races
 *     itself should hit a constraint, not double the answers.
 *
 *  2. The question's key, label and type are copied onto the answer as it is
 *     saved. Archive a question next year and last year's report still reads
 *     exactly as the rep filled it in. `site-visits.ts` chose this property for
 *     the old JSON checklist; keeping it is why answers can be rows without
 *     losing anything.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

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

/** "___ m x ___ m" — the only compound answer the bank asks for. */
export const dimensionSchema = z.object({
  widthM: z.number().finite().nonnegative().nullable().optional(),
  heightM: z.number().finite().nonnegative().nullable().optional(),
});

export const answerInputSchema = z.object({
  questionKey: z.string().trim().min(1).max(120),
  /** Optional: an answer to a question that has since been archived still saves. */
  questionId: z.string().uuid().nullable().optional(),
  value: z.unknown().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  notApplicable: z.boolean().optional(),
});

export type AnswerInput = z.infer<typeof answerInputSchema>;

export const saveAnswersSchema = z.object({
  /** Generated on the device. Makes a replayed section create a no-op. */
  sectionId: z.string().uuid(),
  answers: z.array(answerInputSchema).max(200),
});

type ValueColumns = {
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueOptions: string[];
  valueDate: Date | null;
  valueJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};

const EMPTY: ValueColumns = {
  valueText: null,
  valueNumber: null,
  valueBool: null,
  valueOptions: [],
  valueDate: null,
  valueJson: null as unknown as typeof Prisma.JsonNull,
};

/**
 * Put one answer in the column its type belongs in.
 *
 * Discrete columns rather than a single JSON value: "which sites showed damp?"
 * is the question the bank exists to make answerable, and it should be an
 * indexed lookup rather than a scan over every visit ever done.
 *
 * An unparseable value is stored as null rather than throwing. A rep three
 * hours into a warehouse should not lose a visit because one number arrived as
 * an empty string.
 */
export function valueColumnsFor(type: QuestionType, value: unknown): ValueColumns {
  const out: ValueColumns = { ...EMPTY, valueOptions: [] };
  if (value === null || value === undefined || value === "") return out;

  switch (type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      out.valueText = String(value).slice(0, 4000);
      return out;

    case "NUMBER": {
      const parsed = typeof value === "number" ? value : Number(String(value).trim());
      out.valueNumber = Number.isFinite(parsed) ? parsed : null;
      return out;
    }

    case "BOOLEAN":
      out.valueBool =
        typeof value === "boolean" ? value : ["true", "yes", "1"].includes(String(value).toLowerCase());
      return out;

    case "SINGLE_SELECT":
      out.valueText = String(value).slice(0, 500);
      out.valueOptions = [String(value).slice(0, 500)];
      return out;

    case "MULTI_SELECT":
      out.valueOptions = Array.isArray(value)
        ? value.map((entry) => String(entry).slice(0, 500)).slice(0, 50)
        : [String(value).slice(0, 500)];
      return out;

    case "DATE": {
      const parsed = value instanceof Date ? value : new Date(String(value));
      out.valueDate = Number.isNaN(parsed.getTime()) ? null : parsed;
      return out;
    }

    case "DIMENSION": {
      const parsed = dimensionSchema.safeParse(value);
      if (parsed.success) {
        out.valueJson = parsed.data as Prisma.InputJsonValue;
      }
      return out;
    }

    case "PHOTO_EVIDENCE":
      // The photographs are the answer; this row records that the rep
      // addressed the item, and the photos point back at it.
      out.valueBool = value === false ? false : true;
      return out;
  }
}

/** True when the rep has actually put something against the question. */
export function isAnswered(columns: ValueColumns): boolean {
  return (
    columns.valueText !== null ||
    columns.valueNumber !== null ||
    columns.valueBool !== null ||
    columns.valueDate !== null ||
    columns.valueOptions.length > 0 ||
    (columns.valueJson !== null && columns.valueJson !== undefined)
  );
}

export type SaveAnswersDeps = {
  tx: Tx;
  companyId: string;
  sectionId: string;
  answeredById?: string | null;
};

/**
 * Upsert a batch of answers against one section.
 *
 * Returns the number written. The question's label and type are read from the
 * live definition when one exists, and fall back to the key when it does not,
 * so an answer to an archived question is still saved and still readable.
 */
export async function saveAnswers(
  deps: SaveAnswersDeps,
  answers: AnswerInput[],
): Promise<number> {
  const { tx, companyId, sectionId, answeredById } = deps;
  if (answers.length === 0) return 0;

  const section = await tx.crmSiteVisitSection.findFirst({
    where: { id: sectionId, companyId },
    select: { id: true, questionSetId: true },
  });
  if (!section) throw new Error("Section not found");

  const definitions = section.questionSetId
    ? await tx.crmQuestion.findMany({
        where: { companyId, questionSetId: section.questionSetId },
        select: { id: true, key: true, label: true, type: true, position: true },
      })
    : [];
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));

  let written = 0;
  for (const answer of answers) {
    const definition = byKey.get(answer.questionKey);
    const type = (definition?.type ?? "SHORT_TEXT") as QuestionType;
    const columns = valueColumnsFor(type, answer.value);

    await tx.crmSiteVisitAnswer.upsert({
      where: {
        sectionId_questionKey: { sectionId, questionKey: answer.questionKey },
      },
      create: {
        companyId,
        sectionId,
        questionId: definition?.id ?? answer.questionId ?? null,
        // Snapshotted, so the report survives the question being archived.
        questionKey: answer.questionKey,
        questionLabel: definition?.label ?? answer.questionKey,
        questionType: type,
        position: definition?.position ?? 0,
        notes: answer.notes ?? null,
        notApplicable: answer.notApplicable ?? false,
        answeredById: answeredById ?? null,
        ...columns,
      },
      update: {
        notes: answer.notes ?? null,
        notApplicable: answer.notApplicable ?? false,
        answeredAt: new Date(),
        answeredById: answeredById ?? null,
        ...columns,
      },
    });
    written += 1;
  }

  return written;
}

/**
 * How far through a section the rep is.
 *
 * Counts an explicit "not applicable" as addressed — the rep has answered the
 * question, and a progress bar that never fills because three questions do not
 * apply to this site teaches people to ignore it.
 */
export function sectionProgress(
  questions: Array<{ key: string; isRequired: boolean }>,
  answers: Array<{ questionKey: string; notApplicable: boolean; answered: boolean }>,
): { answered: number; total: number; requiredOutstanding: string[] } {
  const byKey = new Map(answers.map((answer) => [answer.questionKey, answer]));
  let answered = 0;
  const requiredOutstanding: string[] = [];

  for (const question of questions) {
    const match = byKey.get(question.key);
    const addressed = Boolean(match && (match.answered || match.notApplicable));
    if (addressed) answered += 1;
    else if (question.isRequired) requiredOutstanding.push(question.key);
  }

  return { answered, total: questions.length, requiredOutstanding };
}
