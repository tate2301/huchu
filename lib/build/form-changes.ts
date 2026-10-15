import type { FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";
import type { FormChange } from "@/lib/vane/form-changes";

/**
 * Keeping one of Vane's changes to a site-visit form in Build (the
 * PageVaneForm board). Vane reads the form's answers for changes as a job of
 * kind write (`lib/vane/form-changes.ts`, "Read the answers for changes"),
 * each already checked against the form. Keep makes it in the builder's
 * draft only: the form changes for reps when the person publishes.
 */

export type FormDraft = { fields: FieldDefinition[]; quoteLines: QuoteLine[] };

/** Whether the draft already has the change: kept, or made by hand. */
export function hasChange(draft: FormDraft, change: FormChange): boolean {
  if (change.kind === "quote_factor") {
    const line = draft.quoteLines.find((candidate) => candidate.id === change.lineId);
    return Boolean(line && line.quantity.from === "field" && Math.abs((line.quantity.factor ?? 1) - change.factor) < 1e-9);
  }
  const field = draft.fields.find((candidate) => candidate.key === change.key);
  if (!field) return false;
  if (change.kind === "require") return field.required === true;
  return (field.options ?? []).some((option) => option.value === change.option.value);
}

/** The draft with the change made; unchanged when it is already so, or its question or line has gone. */
export function applyFormChange(draft: FormDraft, change: FormChange): FormDraft {
  if (hasChange(draft, change)) return draft;
  if (change.kind === "quote_factor") {
    if (!draft.quoteLines.some((line) => line.id === change.lineId && line.quantity.from === "field")) return draft;
    return {
      ...draft,
      quoteLines: draft.quoteLines.map((line) =>
        line.id === change.lineId && line.quantity.from === "field" ? { ...line, quantity: { ...line.quantity, factor: change.factor } } : line,
      ),
    };
  }
  if (!draft.fields.some((field) => field.key === change.key)) return draft;
  return {
    ...draft,
    fields: draft.fields.map((field) => {
      if (field.key !== change.key) return field;
      if (change.kind === "require") return { ...field, required: true };
      return { ...field, options: [...(field.options ?? []), change.option] };
    }),
  };
}

/** The question it changes, by the key the outline knows it by; null for a quote line. */
export function changedKey(change: FormChange): string | null {
  return change.kind === "quote_factor" ? null : change.key;
}
