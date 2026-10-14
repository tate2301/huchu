import { z } from "zod";

import type { FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

/**
 * A change to a form, from its answers (the PageVaneForm board): Vane reads
 * a site-visit form's answers and proposes changes a person keeps or not.
 * Three kinds, as the board draws them: make a question required, add a
 * choice to a pick-one, change a quote line's waste. Applied to the form as
 * the builder holds it, so a kept change joins the person's draft and goes to
 * reps only when they publish.
 */

export const formChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("require"), key: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("add_option"),
    key: z.string().min(1).max(64),
    option: z.object({ value: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(200) }),
  }),
  z.object({
    type: z.literal("waste"),
    lineId: z.string().min(1).max(40),
    /** The quantity's new factor: 1.13 for 13% waste. */
    factor: z.number().finite().min(1).max(3),
  }),
]);

export type FormChange = z.infer<typeof formChangeSchema>;

export type FormDraft = { fields: FieldDefinition[]; quoteLines: QuoteLine[] };

/** Why a change no longer fits the form, in a sentence; null when it does. */
export function changeRefusal(draft: FormDraft, change: FormChange): string | null {
  if (change.type === "waste") {
    const line = draft.quoteLines.find((candidate) => candidate.id === change.lineId);
    if (!line) return "That quote line is no longer on the form.";
    if (line.quantity.from !== "field") return `${line.description} is a fixed quantity, with no waste to change.`;
    return null;
  }
  const field = draft.fields.find((candidate) => candidate.key === change.key);
  if (!field) return "That question is no longer on the form.";
  if (change.type === "add_option" && !field.options) return `${field.label} is not a list to pick from.`;
  return null;
}

/** Whether the form already has the change: kept, or made by hand. */
export function hasChange(draft: FormDraft, change: FormChange): boolean {
  if (change.type === "waste") {
    const line = draft.quoteLines.find((candidate) => candidate.id === change.lineId);
    return Boolean(line && line.quantity.from === "field" && Math.abs(line.quantity.factor - change.factor) < 1e-9);
  }
  const field = draft.fields.find((candidate) => candidate.key === change.key);
  if (!field) return false;
  if (change.type === "require") return field.required === true;
  return (field.options ?? []).some((option) => option.value === change.option.value);
}

/** The form with the change made; unchanged when it is already so or no longer fits. */
export function applyFormChange(draft: FormDraft, change: FormChange): FormDraft {
  if (changeRefusal(draft, change) || hasChange(draft, change)) return draft;
  if (change.type === "waste") {
    return {
      ...draft,
      quoteLines: draft.quoteLines.map((line) =>
        line.id === change.lineId && line.quantity.from === "field" ? { ...line, quantity: { ...line.quantity, factor: change.factor } } : line,
      ),
    };
  }
  return {
    ...draft,
    fields: draft.fields.map((field) => {
      if (field.key !== change.key) return field;
      if (change.type === "require") return { ...field, required: true };
      return { ...field, options: [...(field.options ?? []), change.option] };
    }),
  };
}

/** The question or line it changes, by the key the outline knows it by. */
export function changedKey(change: FormChange): string | null {
  return change.type === "waste" ? null : change.key;
}

/** One of Vane's changes as the builder's Vane tab shows it. */
export type FormProposal = {
  id: string;
  status: "proposed" | "kept" | "failed";
  headline: string;
  reason: string;
  read: string;
  basis: string | null;
  change: FormChange;
  /** Why keeping it failed, when it did. */
  failed: string | null;
};

/** A Vane action's row as a proposal for this form, or null when it is not one. */
export function proposalOf(row: { id: string; status: string; params: unknown; result: string | null }): FormProposal | null {
  const params = (row.params ?? {}) as Record<string, unknown>;
  const change = formChangeSchema.safeParse(params.change);
  if (!change.success) return null;
  const status = row.status === "DONE" ? "kept" : row.status === "FAILED" ? "failed" : row.status === "PROPOSED" ? "proposed" : null;
  if (!status) return null;
  return {
    id: row.id,
    status,
    headline: String(params.headline ?? ""),
    reason: String(params.reason ?? ""),
    read: String(params.read ?? ""),
    basis: typeof params.basis === "string" && params.basis ? params.basis : null,
    change: change.data,
    failed: status === "failed" ? row.result : null,
  };
}
