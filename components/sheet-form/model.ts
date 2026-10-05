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
  return withDerived(kind, values);
}

/**
 * The values with every `derive` field worked out again, except those the
 * person has typed in: a suggested short code follows the name until changed.
 */
export function withDerived(kind: SheetKind, values: SheetValues, touched: ReadonlySet<string> = new Set()): SheetValues {
  let next = values;
  for (const section of kind.sections) {
    for (const field of section.fields) {
      if (!field.derive || touched.has(field.id)) continue;
      const derived = field.derive(next);
      if (derived !== next[field.id]) next = { ...next, [field.id]: derived };
    }
  }
  return next;
}

/** A title or sub: fixed, or worked out from the context and what was loaded. */
export function sheetText(
  value: string | ((ctx: SheetCtx, values: SheetValues) => string),
  ctx: SheetCtx,
  values: SheetValues,
): string {
  return typeof value === "function" ? value(ctx, values) : value;
}

/** Sections whose `when` and `show` hold. */
export function shownSections(kind: SheetKind, values: SheetValues, ctx?: SheetCtx): SheetSection[] {
  return kind.sections.filter(
    (section) =>
      (!section.when || values[section.when[0]] === section.when[1]) &&
      (!section.show || (ctx !== undefined && section.show(values, ctx))),
  );
}

/** The fields of a section that are drawn now. */
export function shownFields(section: SheetSection, values: SheetValues, ctx: SheetCtx): FieldSpec[] {
  return section.fields.filter((field) => !field.show || field.show(values, ctx));
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
  for (const section of shownSections(kind, values, ctx)) {
    if (section.forDanger) continue;
    for (const field of shownFields(section, values, ctx)) {
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
export function discardAsk(title: string, { record = false }: { record?: boolean } = {}): Ask {
  return {
    // A sheet titled by its record ("Spirits") names it as it is.
    title: record ? `Discard changes to ${title}?` : `Discard this ${title.charAt(0).toLowerCase()}${title.slice(1)}?`,
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
  // 400 for a wrong value, 409 for one already taken ("There is already a category called Mixers.").
  if ((status === 400 || status === 409) && body.fieldErrors && typeof body.fieldErrors === "object") {
    const fieldErrors: Record<string, string> = {};
    const stray: string[] = [];
    for (const [key, value] of Object.entries(body.fieldErrors)) {
      if (typeof value !== "string") continue;
      // "lines.2" is the third line of the `lines` field: kept under its own key.
      if (fieldIds.includes(key) || fieldIds.includes(key.split(".")[0]!)) fieldErrors[key] = value;
      else stray.push(value);
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors, footer: stray.length > 0 ? sentence(stray[0]!) : null };
    }
  }
  return { fieldErrors: {}, footer: sentence(message ?? "That did not work. Nothing was saved; try again") };
}

/** "SH-00243 open on the back till for Kuda Banda." */
export function doneSentence(kind: SheetKind, result: unknown, values: SheetValues = {}): string {
  return typeof kind.done === "function" ? kind.done(result, values) : kind.done;
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

/** A field's messages per line ("lines.2" → 2), from every message the sheet holds. */
export function lineErrorsOf(fieldId: string, errors: Record<string, string>): Record<number, string> {
  const prefix = `${fieldId}.`;
  const out: Record<number, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (!key.startsWith(prefix)) continue;
    const index = Number(key.slice(prefix.length));
    if (Number.isInteger(index)) out[index] = message;
  }
  return out;
}

/** Every field id the kind draws, in order. */
export function fieldIds(kind: SheetKind): string[] {
  return kind.sections.flatMap((section) => section.fields.map((field) => field.id));
}
