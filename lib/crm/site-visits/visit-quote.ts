/**
 * The quote a site visit's answers draft.
 *
 * Each section opened on the visit carries its form's quote lines; the
 * answers saved against it fill them in. What comes out is the lines a new
 * quotation starts with, so a floor measured on site is not typed again at
 * the office.
 */

import type { Prisma } from "@prisma/client";

import type { CrmDocumentLineInput } from "@/lib/crm/accounting-bridge";
import { answerValue, fieldFromQuestion, quoteLinesOf, type QuestionRow, type StoredAnswer } from "@/lib/crm/site-visits/fields";
import { draftQuote, draftSubtotal, type DraftedLine } from "@/lib/forms/quote";

type Tx = Prisma.TransactionClient;

export type SectionForQuote = {
  name: string;
  questionSet: { questions: QuestionRow[]; quoteLines: unknown } | null;
  answers: Array<StoredAnswer & { questionKey: string; notApplicable: boolean }>;
};

/** One section's drafted lines. Answers marked not applicable count as not given. */
export function draftSectionQuote(section: SectionForQuote): DraftedLine[] {
  if (!section.questionSet) return [];
  const lines = quoteLinesOf(section.questionSet.quoteLines);
  if (lines.length === 0) return [];
  const fields = section.questionSet.questions.map(fieldFromQuestion);
  const answers: Record<string, unknown> = {};
  for (const answer of section.answers) {
    if (!answer.notApplicable) answers[answer.questionKey] = answerValue(answer);
  }
  return draftQuote(lines, fields, answers);
}

/** A drafted line as a quotation line: the unit it is counted in kept with what it is. */
export function toQuotationLine(line: DraftedLine): CrmDocumentLineInput {
  return {
    description: line.unit ? `${line.description} (${line.unit})` : line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    ...(line.taxRate !== undefined ? { taxRate: line.taxRate } : {}),
  };
}

/** Every section's lines, in the order the sections were opened. */
export async function draftVisitQuote(tx: Tx, companyId: string, appointmentId: string) {
  const sections = await tx.crmSiteVisitSection.findMany({
    where: { companyId, appointmentId },
    orderBy: { position: "asc" },
    include: {
      answers: true,
      questionSet: { include: { questions: { where: { archivedAt: null }, orderBy: { position: "asc" } } } },
    },
  });
  const drafted = sections.map((section) => ({ name: section.name, lines: draftSectionQuote(section) }));
  return {
    sections: drafted.filter((section) => section.lines.length > 0).map((section) => ({ name: section.name, lines: section.lines, subtotal: draftSubtotal(section.lines) })),
    lines: drafted.flatMap((section) => section.lines.map(toQuotationLine)),
  };
}
