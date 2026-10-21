import type { BulkResult, UndoChoices } from "./undo-rules";

/**
 * What the undo dialogs say, from what the core already answers (`undoChoices`,
 * the bulk result): the labelled lines of "what happens", which of delete's four
 * refusals applies, and which of the result's four words a row falls under. Pure,
 * so a test walks them. Nothing here changes the books or the core's rules.
 */

export type Will = { label: string; text: string };

const WILL_ORDER = ["Credit note", "Posting", "Payments", "Commission", "VAT return", "Bank", "Invoice", "Effect"];

/** A void's effect lines, each under its label ("Credit note", "Posting", "Payments"), in the order the design reads them. */
export function voidWill(choices: Pick<UndoChoices, "kind" | "fiscalised" | "effects" | "onAccount" | "nextNote">): Will[] {
  const out: Will[] = [];
  for (const effect of choices.effects) {
    if (/VAT return/.test(effect)) out.push({ label: "VAT return", text: effect });
    else if (/credit note is issued/i.test(effect)) out.push({ label: "Credit note", text: choices.nextNote ? `${choices.nextNote}${choices.fiscalised ? ", signed on FDMS" : ""}` : effect });
    else if (/stays? on the customer|stays? as credit|on the supplier/i.test(effect)) out.push({ label: "Payments", text: effect });
    else if (/commission/i.test(effect)) out.push({ label: "Commission", text: effect });
    else if (/bank line/i.test(effect)) out.push({ label: "Bank", text: effect });
    else if (/owed again/i.test(effect)) out.push({ label: "Invoice", text: effect });
    else if (/posting is reversed|reversing journal/i.test(effect)) out.push({ label: "Posting", text: effect });
    else out.push({ label: "Effect", text: effect });
  }
  if (choices.kind === "invoice") {
    if (!out.some((will) => will.label === "Posting")) out.push({ label: "Posting", text: "The mirror of its posting, dated today" });
    if (!out.some((will) => will.label === "Payments")) out.push({ label: "Payments", text: choices.onAccount.length ? `${choices.onAccount.join(", ")} stay on the customer’s account` : "None on it, so none to move" });
  }
  return out.sort((a, b) => WILL_ORDER.indexOf(a.label) - WILL_ORDER.indexOf(b.label));
}

export type RuleRow = { rule: string; here: "yes" | "no" | "unknown" };

/**
 * Delete's four refusals against this document, in the order the core checks
 * them. The core stops at the first that holds, so the ones before it read No
 * and the ones after it are unknown. Null when the refusal is none of the four
 * (a module's own document, a right), where the table has nothing to say.
 */
export function deleteRuleRows(choices: Pick<UndoChoices, "fiscalised" | "delete">): RuleRow[] | null {
  const why = choices.delete.why ?? "";
  if (choices.delete.allowed) return null;
  const hit = /reconciliation/i.test(why) ? 3 : /VAT return/i.test(why) ? 2 : /figures have been reported/i.test(why) ? 1 : choices.fiscalised && /fiscalised/i.test(why) ? 0 : -1;
  if (hit < 0) return null;
  const rules = ["It was fiscalised", "Its month is closed, or before the freeze date", "It's in a finalised or filed VAT return", "A payment on it sits in a closed reconciliation"];
  return rules.map((rule, index) => ({ rule, here: index === hit ? "yes" : index < hit ? "no" : "unknown" }));
}

/** The first sentence of a refusal, for its bold lead, and the rest. */
export function leadOf(text: string): { lead: string; rest: string } {
  const cut = text.search(/[.:] /);
  return cut < 0 ? { lead: text, rest: "" } : { lead: text.slice(0, cut + 1), rest: text.slice(cut + 2) };
}

export type Outcome = "done" | "unchanged" | "skipped" | "refused";

/**
 * Which of the result's four words a row falls under. The core answers done,
 * skipped (with why) or failed: already void is Unchanged, a draft or a row
 * that is gone is Skipped, and everything a rule or a right turned away, or
 * that broke, is Refused (and can be tried again).
 */
export function bulkOutcome(bucket: "done" | "skipped" | "failed", why?: string): Outcome {
  if (bucket === "done") return "done";
  if (bucket === "failed") return "refused";
  const text = why ?? "";
  if (/is void already|already void/i.test(text)) return "unchanged";
  if (/is a draft|a draft and nothing|not found|may have been deleted/i.test(text)) return "skipped";
  return "refused";
}

export type OutcomeRow = { id: string; label: string; outcome: Outcome; why: string };

/** Every row of a bulk answer, with its outcome. */
export function outcomes(answer: Pick<BulkResult, "done" | "skipped" | "failed">): OutcomeRow[] {
  return [
    ...answer.done.map((row) => ({ id: row.id, label: row.label, outcome: "done" as const, why: row.detail ?? "" })),
    ...answer.skipped.map((row) => ({ id: row.id, label: row.label, outcome: bulkOutcome("skipped", row.why), why: row.why })),
    ...answer.failed.map((row) => ({ id: row.id, label: row.label, outcome: "refused" as const, why: row.why })),
  ];
}

/** One line for a group of rows: their reason when they share one, else the most common and how many others. */
export function sharedWhy(rows: Array<{ why: string }>): string {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.why, (counts.get(row.why) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return "";
  if (ranked.length === 1) return ranked[0][0];
  return `${ranked[0][0]} ${ranked.length - 1 === 1 ? "1 other reason" : `${ranked.length - 1} other reasons`} in the list.`;
}
