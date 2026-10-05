import type { Ask } from "@/lib/workspace/ask";
import type { FieldSpec, SheetCtx, SheetKind, SheetLine, SheetSection, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * The rules of a sheet that are not drawing (00-foundations 5.7): starting
 * values, which sections show, what "needed" means for each field type, what
 * changed, and what the server's answer says to show where.
 */

export function resolve<T>(value: T | ((ctx: SheetCtx) => T), ctx: SheetCtx): T {
  return typeof value === "function" ? (value as (ctx: SheetCtx) => T)(ctx) : value;
}

/** A field's empty value by type. */
function emptyValue(field: FieldSpec): unknown {
  switch (field.t) {
    case "auto":
    case "photo":
      return null;
    case "toggle":
      return false;
    case "tags":
    case "lines":
      return [];
    default:
      return "";
  }
}

export function initialValues(kind: SheetKind, ctx: SheetCtx): SheetValues {
  const values: SheetValues = {};
  for (const section of kind.sections) {
    for (const field of section.fields) {
      const fixed = field.fixed?.(ctx);
      if (fixed) values[field.id] = fixed.value;
      else values[field.id] = field.v === undefined ? emptyValue(field) : resolve(field.v, ctx);
    }
  }
  return values;
}

/** Sections whose `when` holds. */
export function shownSections(kind: SheetKind, values: SheetValues): SheetSection[] {
  return kind.sections.filter((section) => !section.when || values[section.when[0]] === section.when[1]);
}

export function isEmptyValue(field: FieldSpec, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (field.t === "toggle") return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/** "Till is needed." */
export function neededMessage(label: string): string {
  return `${label} is needed.`;
}

/**
 * The client's check before sending: every shown field without `opt` must have
 * a value, and a value must pass the field's schema. Read fields are never
 * checked. Returns the messages by field id, in the order the fields are drawn.
 */
export function checkValues(kind: SheetKind, values: SheetValues, ctx: SheetCtx): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const section of shownSections(kind, values)) {
    for (const field of section.fields) {
      if (field.t === "read" || field.fixed?.(ctx)) continue;
      const value = values[field.id];
      if (isEmptyValue(field, value)) {
        if (!field.opt) errors[field.id] = neededMessage(field.l);
        continue;
      }
      if (field.schema) {
        const parsed = field.schema.safeParse(value);
        if (!parsed.success) errors[field.id] = parsed.error.issues[0]?.message ?? `Check ${field.l.toLowerCase()}.`;
      }
    }
  }
  return errors;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function isDirty(initial: SheetValues, values: SheetValues): boolean {
  return Object.keys({ ...initial, ...values }).some((key) => !same(initial[key], values[key]));
}

/** The ask before closing with unsaved input (**Defined here** in 5.7.1). */
export function discardAsk(title: string): Ask {
  return {
    title: `Discard this ${title.charAt(0).toLowerCase()}${title.slice(1)}?`,
    body: "What you typed is not saved.",
    keep: "Keep editing",
    go: "Discard",
    fill: "bad",
  };
}

export type SubmitFailure = { fieldErrors: Record<string, string>; footer: string | null };

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * What a refused submit shows (5.7.3): field messages under their fields, or
 * one sentence in the footer — the server's words, made a sentence.
 */
export function submitFailure(status: number, payload: unknown, fieldIds: readonly string[]): SubmitFailure {
  const body = (payload && typeof payload === "object" ? payload : {}) as {
    error?: unknown;
    fieldErrors?: Record<string, unknown>;
  };
  const message = typeof body.error === "string" && body.error.trim() ? body.error : null;
  if (status === 400 && body.fieldErrors && typeof body.fieldErrors === "object") {
    const fieldErrors: Record<string, string> = {};
    const stray: string[] = [];
    for (const [key, value] of Object.entries(body.fieldErrors)) {
      if (typeof value !== "string") continue;
      if (fieldIds.includes(key)) fieldErrors[key] = value;
      else stray.push(value);
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors, footer: stray.length > 0 ? sentence(stray[0]!) : null };
    }
  }
  return { fieldErrors: {}, footer: sentence(message ?? "That did not work. Nothing was saved; try again") };
}

/** "SH-00243 open on the back till for Kuda Banda." */
export function doneSentence(kind: SheetKind, result: unknown): string {
  return typeof kind.done === "function" ? kind.done(result) : kind.done;
}

/** A money string as an amount ("1,284.6" → 1284.6), or 0. */
export function amountOf(value: string): number {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The totals under a `lines` field: line count, quantity and value. */
export function lineTotals(lines: readonly SheetLine[]) {
  return lines.reduce(
    (sum, line) => {
      const quantity = amountOf(line.quantity);
      return { count: sum.count + 1, quantity: sum.quantity + quantity, value: sum.value + quantity * amountOf(line.cost) };
    },
    { count: 0, quantity: 0, value: 0 },
  );
}

/** Every field id the kind draws, in order. */
export function fieldIds(kind: SheetKind): string[] {
  return kind.sections.flatMap((section) => section.fields.map((field) => field.id));
}
