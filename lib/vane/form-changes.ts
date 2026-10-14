import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { fieldFromQuestion, quoteLinesOf } from "@/lib/crm/site-visits/fields";
import { loadFormInsights } from "@/lib/crm/site-visits/insights";
import { CHOICE_FIELD_TYPES, type FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

import type { MessagesClient } from "./claude";
import { jsonIn, VaneWriteRefused, writeAsJob, type Who } from "./write";

/**
 * Changes to a site-visit form, from its answers (the PageVaneForm board):
 * Vane reads the form's own insights (how often each question was answered,
 * and how those visits went) and the notes reps left, and proposes up to
 * three changes, each checked against the form before it is offered. A kept
 * change joins the builder's draft; nothing is saved until the person saves.
 */

export type FormChange =
  | { kind: "require"; key: string; title: string; why: string; read: string }
  | { kind: "add_option"; key: string; option: { value: string; label: string }; title: string; why: string; read: string }
  | { kind: "quote_factor"; lineId: string; factor: number; title: string; why: string; read: string };

const SYSTEM = `You are Vane, the helper inside Corelith. You look at how a site-visit form has been answered and propose at most three changes that would make the visits it records more useful: a question to make required, an option to add to a pick question, or a quote line's waste factor. Only propose what the figures or the reps' notes show; say the figures. Answer with only a JSON object.`;

const answerSchema = z.object({
  changes: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("require"), key: z.string(), why: z.string().max(300), read: z.string().max(120) }),
        z.object({ kind: z.literal("add_option"), key: z.string(), label: z.string().min(1).max(80), why: z.string().max(300), read: z.string().max(120) }),
        z.object({ kind: z.literal("quote_factor"), lineId: z.string(), factor: z.number(), why: z.string().max(300), read: z.string().max(120) }),
      ]),
    )
    .max(3),
});

const optionValue = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "option";

/** A change that fits the form as it stands, worded for its card; null when it does not. */
export function checkChange(change: z.infer<typeof answerSchema>["changes"][number], fields: FieldDefinition[], lines: QuoteLine[]): FormChange | null {
  if (change.kind === "quote_factor") {
    const line = lines.find((row) => row.id === change.lineId);
    if (!line || line.quantity.from !== "field" || change.factor < 1 || change.factor > 2) return null;
    if (Math.abs(change.factor - (line.quantity.factor ?? 1)) < 0.005) return null;
    const percent = Math.round((change.factor - 1) * 100);
    return { kind: "quote_factor", lineId: line.id, factor: change.factor, title: `${line.description}: ${percent}% waste, not ${Math.round(((line.quantity.factor ?? 1) - 1) * 100)}%`, why: change.why, read: change.read };
  }
  const field = fields.find((row) => row.key === change.key);
  if (!field) return null;
  if (change.kind === "require") {
    if (field.required) return null;
    return { kind: "require", key: field.key, title: `Make ${field.label} required`, why: change.why, read: change.read };
  }
  if (!(CHOICE_FIELD_TYPES as readonly string[]).includes(field.type)) return null;
  const value = optionValue(change.label);
  if ((field.options ?? []).some((option) => option.value === value || option.label.toLowerCase() === change.label.toLowerCase())) return null;
  return { kind: "add_option", key: field.key, option: { value, label: change.label }, title: `Add ${change.label} to ${field.label}`, why: change.why, read: change.read };
}

export async function suggestFormChanges(db: PrismaClient, who: Who, setId: string, client?: MessagesClient): Promise<FormChange[]> {
  const loaded = await loadFormInsights(db, who.companyId, setId);
  if (!loaded) throw new VaneWriteRefused(404, "That form is not here.");
  const set = await db.crmQuestionSet.findFirstOrThrow({
    where: { id: setId, companyId: who.companyId },
    include: { questions: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
  });
  const fields = set.questions.map(fieldFromQuestion);
  const lines = quoteLinesOf(set.quoteLines);
  const { insights } = loaded;
  if (insights.questions.every((question) => question.asked === 0)) throw new VaneWriteRefused(409, "No visit has used this form yet, so there is nothing to learn from.");
  const notes = await db.crmSiteVisitAnswer.findMany({
    where: { companyId: who.companyId, section: { questionSetId: setId }, notes: { not: null } },
    orderBy: { answeredAt: "desc" },
    take: 60,
    select: { questionKey: true, notes: true, notApplicable: true },
  });

  const prompt = `The form "${loaded.name}".

Its questions (key, label, type, required, options):
${fields.map((field) => `- ${field.key}: "${field.label}", ${field.type}${field.required ? ", required" : ""}${field.options?.length ? `, options ${field.options.map((option) => option.label).join(" / ")}` : ""}${field.showWhen ? `, asked when ${field.showWhen.key} ${field.showWhen.op} ${field.showWhen.value ?? ""}` : ""}`).join("\n")}

Its quote lines (id, what, quantity):
${lines.map((line) => `- ${line.id}: ${line.description}, ${line.quantity.from === "field" ? `${line.quantity.key} × ${line.quantity.factor ?? 1}${line.quantity.per ? `, packs of ${line.quantity.per}` : ""}` : `fixed ${line.quantity.value}`}`).join("\n") || "(none)"}

How it was answered (of the visits asked each question: answered, not applicable, and of those answered how many were won; ${insights.won} of the visits were won in all):
${insights.questions.map((question) => `- ${question.key}: asked ${question.asked}, answered ${question.answered}, n/a ${question.notApplicable}, won when answered ${question.wonWhenAnswered}${question.feedsQuote ? ", feeds the quote" : ""}`).join("\n")}
${insights.breakdown ? `\nBy ${insights.breakdown.question}: ${insights.breakdown.rows.map((row) => `${row.answer} ${row.visits} visits, ${row.won} won`).join("; ")}` : ""}

What reps wrote in notes, newest first:
${notes.map((note) => `- ${note.questionKey}${note.notApplicable ? " (marked n/a)" : ""}: ${note.notes!.slice(0, 160)}`).join("\n") || "(none)"}

Answer {"changes": [{"kind": "require", "key": "...", "why": "Skipped on 18 of 86 visits. Those quotes were won 33% of the time, against 53% with it.", "read": "Site visit answers"} | {"kind": "add_option", "key": "...", "label": "Screed", "why": "...", "read": "..."} | {"kind": "quote_factor", "lineId": "...", "factor": 1.13, "why": "...", "read": "..."}]}, at most three, none when nothing is clear.`;

  return writeAsJob(
    db,
    who,
    `Read the answers to ${loaded.name} for changes`,
    async (ask) => {
      const answer = answerSchema.safeParse(jsonIn(await ask(prompt)));
      if (!answer.success) throw new VaneWriteRefused(503, "Vane's changes did not come back whole. Try again.");
      return answer.data.changes.flatMap((change) => {
        const checked = checkChange(change, fields, lines);
        return checked ? [checked] : [];
      });
    },
    client,
    SYSTEM,
  );
}
