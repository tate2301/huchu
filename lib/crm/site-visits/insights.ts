/**
 * What a site-visit form's own visits say about it.
 *
 * Which questions reps stop answering, how the floors they measured were
 * quoted and won, and the one change that would most likely have made the
 * quotes better: a measurement the quote counts, or that decides whether a
 * line is quoted, being left blank.
 */

import type { Prisma } from "@prisma/client";

import { answerValue, fieldFromQuestion, quoteLinesOf, type QuestionRow, type StoredAnswer } from "@/lib/crm/site-visits/fields";
import { draftSectionQuote } from "@/lib/crm/site-visits/visit-quote";
import { CHOICE_FIELD_TYPES, DISPLAY_FIELD_TYPES, MEASURE_FIELD_TYPES, isShown, measureOf, measureUnit, type FieldDefinition } from "@/lib/forms/fields";
import { draftSubtotal } from "@/lib/forms/quote";

type Tx = Prisma.TransactionClient;

export type InsightSection = {
  createdAt: Date;
  answers: Array<StoredAnswer & { questionKey: string; notApplicable: boolean }>;
  /** The rep is who the visit was assigned to, when the loader read it. */
  appointment: { deal: { status: string } | null; assignedTo?: { name: string | null; email?: string | null } | null };
};

export type FormInsights = {
  visits: number;
  since: string | null;
  drafted: number;
  won: number;
  /** Per question asked: of the visits that were asked it, how many answered, and how many of those were won. */
  questions: Array<{ key: string; label: string; asked: number; answered: number; notApplicable: number; feedsQuote: boolean; wonWhenAnswered: number }>;
  /**
   * Visits by the answer to the form's first pick-one, with what they measured
   * and how they went. The visits that left it blank are the last row
   * (`blank`), so the rows add up to every visit.
   */
  breakdown: {
    question: string;
    unit: string;
    rows: Array<{ answer: string; visits: number; won: number; measuredPerVisit: number | null; blank?: true }>;
  } | null;
  figures: { measuredPerVisit: number | null; measureUnit: string; draftedPerVisit: number | null };
  /** The question worth making required, and how many visits went without it. */
  suggestion: { key: string; label: string; missing: number } | null;
  /** Visits that drafted no quote, and the reps they were, most first. */
  undrafted: { count: number; byRep: Array<{ rep: string; count: number }> };
};

const blank = (value: unknown) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
const round = (value: number) => Math.round(value * 100) / 100;

export function formInsights(set: { questions: QuestionRow[]; quoteLines: unknown }, sections: readonly InsightSection[]): FormInsights {
  const fields = set.questions.map(fieldFromQuestion);
  const lines = quoteLinesOf(set.quoteLines);
  const quoted = new Set<string>();
  // Answers that decide whether something is quoted, or asked, at all. Left
  // blank, the decision is made for the rep — unlike a run of coving left
  // blank, which mostly means there is none.
  const deciding = new Set<string>(fields.flatMap((field) => (field.showWhen ? [field.showWhen.key] : [])));
  for (const line of lines) {
    if (line.quantity.from === "field") quoted.add(line.quantity.key);
    if (line.showWhen) {
      quoted.add(line.showWhen.key);
      deciding.add(line.showWhen.key);
    }
  }

  const visits = sections.map((section) => {
    const answers: Record<string, unknown> = {};
    const notApplicable = new Set<string>();
    for (const answer of section.answers) {
      if (answer.notApplicable) notApplicable.add(answer.questionKey);
      else answers[answer.questionKey] = answerValue(answer);
    }
    const drafted = draftSubtotal(draftSectionQuote({ name: "", questionSet: set, answers: section.answers }));
    const person = section.appointment.assignedTo;
    const rep = person ? person.name?.trim() || person.email || null : null;
    return { answers, notApplicable, drafted, won: section.appointment.deal?.status === "WON", rep };
  });

  const asked = fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type));
  const questions = asked.map((field) => {
    const shownOn = visits.filter((visit) => isShown(field, fields, visit.answers));
    const answeredOn = shownOn.filter((visit) => !blank(visit.answers[field.key]));
    return {
      key: field.key,
      label: field.label,
      asked: shownOn.length,
      answered: answeredOn.length,
      notApplicable: shownOn.filter((visit) => visit.notApplicable.has(field.key)).length,
      feedsQuote: quoted.has(field.key),
      wonWhenAnswered: answeredOn.filter((visit) => visit.won).length,
    };
  });

  // The figure most quotes are counted from: the first measurement a line uses, else the first area.
  const measure: FieldDefinition | undefined =
    asked.find((field) => quoted.has(field.key) && MEASURE_FIELD_TYPES.includes(field.type)) ??
    asked.find((field) => field.type === "areas" || field.type === "area");
  const figureOf = (visit: (typeof visits)[number]) => (measure ? measureOf(measure, visit.answers[measure.key]) : null);
  const average = (values: Array<number | null>) => {
    const given = values.filter((value): value is number => value !== null);
    return given.length ? round(given.reduce((sum, value) => sum + value, 0) / given.length) : null;
  };

  const choice = asked.find((field) => CHOICE_FIELD_TYPES.includes(field.type) && field.type === "select");
  const rowOf = (answer: string, these: typeof visits) => ({
    answer,
    visits: these.length,
    won: these.filter((visit) => visit.won).length,
    measuredPerVisit: average(these.map(figureOf)),
  });
  const known = new Set((choice?.options ?? []).map((option) => option.value));
  const unanswered = choice ? visits.filter((visit) => !known.has(visit.answers[choice.key] as string)) : [];
  const breakdown = choice
    ? {
        question: choice.label,
        unit: measure ? measureUnit(measure) : "",
        rows: [
          ...(choice.options ?? [])
            .map((option) => rowOf(option.label, visits.filter((visit) => visit.answers[choice.key] === option.value)))
            .filter((row) => row.visits > 0),
          ...(unanswered.length > 0 ? [{ ...rowOf("Not answered", unanswered), blank: true as const }] : []),
        ],
      }
    : null;

  // Worth requiring: an optional question that decides what is quoted, left
  // blank on the most visits. A question nobody needs is not worth a rep's time.
  const optional = new Set(asked.filter((field) => !field.required).map((field) => field.key));
  const candidate = questions
    .filter((question) => optional.has(question.key) && deciding.has(question.key))
    .map((question) => ({ key: question.key, label: question.label, missing: question.asked - question.answered - question.notApplicable }))
    .filter((question) => question.missing > 0)
    .sort((a, b) => b.missing - a.missing)[0];

  const reps = new Map<string, number>();
  for (const visit of visits) if (visit.drafted <= 0) reps.set(visit.rep ?? "No rep", (reps.get(visit.rep ?? "No rep") ?? 0) + 1);

  const first = sections.reduce<Date | null>((earliest, section) => (!earliest || section.createdAt < earliest ? section.createdAt : earliest), null);

  return {
    visits: visits.length,
    since: first ? first.toISOString().slice(0, 10) : null,
    drafted: visits.filter((visit) => visit.drafted > 0).length,
    won: visits.filter((visit) => visit.won).length,
    questions,
    breakdown,
    figures: {
      measuredPerVisit: average(visits.map(figureOf)),
      measureUnit: measure ? measureUnit(measure) : "",
      draftedPerVisit: average(visits.map((visit) => (visit.drafted > 0 ? visit.drafted : null))),
    },
    suggestion: candidate ?? null,
    undrafted: {
      count: visits.filter((visit) => visit.drafted <= 0).length,
      byRep: [...reps].map(([rep, count]) => ({ rep, count })).sort((a, b) => b.count - a.count || a.rep.localeCompare(b.rep)),
    },
  };
}

/** Which visits a form's insights read: the days they were made, and one rep's. */
export type InsightFilter = { from?: Date | null; to?: Date | null; repId?: string | null };

export async function loadFormInsights(tx: Tx, companyId: string, setId: string, filter: InsightFilter = {}) {
  const set = await tx.crmQuestionSet.findFirst({
    where: { id: setId, companyId },
    include: { questions: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
  });
  if (!set) return null;
  const createdAt = filter.from || filter.to ? { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } : undefined;
  const sections = await tx.crmSiteVisitSection.findMany({
    where: {
      companyId,
      questionSetId: setId,
      ...(createdAt ? { createdAt } : {}),
      ...(filter.repId ? { appointment: { assignedToId: filter.repId } } : {}),
    },
    select: {
      createdAt: true,
      answers: true,
      appointment: { select: { deal: { select: { status: true } }, assignedTo: { select: { name: true, email: true } } } },
    },
  });
  return { name: set.name, insights: formInsights(set, sections) };
}

/**
 * The site-visit forms a workspace has, with how many visits used each (most
 * first), and the reps who made those visits: the Site visits insight's Form
 * and rep chips.
 */
export async function visitFormChoices(tx: Tx, companyId: string) {
  const [sets, sections] = await Promise.all([
    tx.crmQuestionSet.findMany({ where: { companyId }, select: { id: true, name: true, archivedAt: true }, orderBy: { name: "asc" } }),
    tx.crmSiteVisitSection.findMany({
      where: { companyId, questionSetId: { not: null } },
      select: { questionSetId: true, appointment: { select: { assignedTo: { select: { id: true, name: true, email: true } } } } },
    }),
  ]);
  const used = new Map<string, number>();
  const reps = new Map<string, string>();
  for (const section of sections) {
    if (section.questionSetId) used.set(section.questionSetId, (used.get(section.questionSetId) ?? 0) + 1);
    const person = section.appointment.assignedTo;
    if (person) reps.set(person.id, person.name?.trim() || person.email || "A rep");
  }
  return {
    // An archived form stays while visits still read it.
    forms: sets
      .map((set) => ({ id: set.id, name: set.name, visits: used.get(set.id) ?? 0, archived: set.archivedAt !== null }))
      .filter((set) => set.visits > 0 || !set.archived)
      .map((set) => ({ id: set.id, name: set.name, visits: set.visits }))
      .sort((a, b) => b.visits - a.visits),
    reps: [...reps].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
