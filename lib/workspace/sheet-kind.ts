import type { ZodType } from "zod";

import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import type { Ask } from "@/lib/workspace/ask";

/**
 * A sheet kind: one create or edit form, as data (00-foundations 5.7.6). The
 * `K` entries of `Sheet.dc.html` are the schema; each area writes its kinds in
 * `lib/retail/sheet-kinds/<area>.ts` and `components/sheet-form/sheet-form.tsx`
 * renders any of them.
 */

export type SheetCurrency = "US$" | "ZiG";

/** What a kind knows about where it was opened and by whom. */
export type SheetCtx = {
  /** The sheet's own address: `id`, `ids`, and any prefill the opener passed. */
  params: URLSearchParams;
  id: string | null;
  user: { id: string; name: string; role: string };
  can: (resource: RetailResource, action: RetailAction) => boolean;
};

/** A picked `auto` option: what it sends and what it reads as. */
export type PickedOption = { id: string; label: string; sub?: string | null; cost?: string | null };

/** One line of a `lines` field. */
export type SheetLine = { productId: string; name: string; sub: string | null; warn?: boolean; quantity: string; cost: string };

export type SheetValues = Record<string, unknown>;

export type FieldType =
  | "text"
  | "auto"
  | "seg"
  | "toggle"
  | "money"
  | "area"
  | "tags"
  | "cards"
  | "lines"
  | "read"
  | "photo";

export type FieldSpec = {
  id: string;
  t: FieldType;
  /** The label. */
  l: string;
  /** The starting value, or how to work it out from the context. */
  v?: unknown | ((ctx: SheetCtx) => unknown);
  /** Placeholder. */
  p?: string;
  /** Hint under the control. */
  h?: string | ((values: SheetValues) => string);
  half?: boolean;
  /** Optional: a field without it is required. */
  opt?: boolean;
  mono?: boolean;
  right?: boolean;
  /** `text`: upper case as typed (a short code). */
  upper?: boolean;
  tone?: "ok" | "warn";
  /** The hint in `--warn`, always or while this holds (the default site switched off). */
  warn?: boolean | ((values: SheetValues) => boolean);
  /**
   * `seg` labels, `text` choices (a select drawn as text), or `cards` as
   * [label, description?, badge?]; or worked out from what was loaded ("Move
   * some from Harare Main Branch").
   */
  o?: string[] | Array<[label: string, sub?: string, badge?: string]> | ((values: SheetValues) => string[]);
  cols?: number;
  rows?: number;
  /** `auto` and `lines`: the lookup noun (`GET /api/v2/retail/lookup/<noun>`). */
  noun?: string;
  /** `auto`: narrows the lookup (`?context=`), e.g. `{ can: "sell" }`, or from the sheet's address. */
  context?: Record<string, unknown> | ((ctx: SheetCtx) => Record<string, unknown>);
  /** `lines`: the quantity and cost column labels. */
  ql?: string;
  cl?: string;
  cur?: SheetCurrency;
  nolabel?: boolean;
  /** `photo`: the value line while empty ("Add your logo"). */
  prompt?: string;
  /**
   * Draws the field as `read`, holding a fixed value, when the person may not
   * choose (a cashier opening their own shift sees themselves).
   */
  fixed?: (ctx: SheetCtx) => { value: unknown; shown: string } | null;
  /** `tags`: the last tag cannot be removed (a site keeps at least one place). */
  keepOne?: boolean;
  /**
   * Follows the other values until the person types in it (a short code
   * suggested from the name). Worked out from every value, `_` facts included.
   */
  derive?: (values: SheetValues) => string;
  /** Checked on a non-empty value before sending: the endpoint's own rule. */
  schema?: ZodType;
  /** Drawn but not changeable while this holds (hours while licence hours are off). */
  disabled?: (values: SheetValues) => boolean;
  /** Drawn only while this holds; a field not drawn is neither checked nor needed. */
  show?: (values: SheetValues, ctx: SheetCtx) => boolean;
};

export type SheetSection = {
  title?: string;
  /** Folded behind a dashed button: [label, hint]. */
  fold?: [label: string, hint: string];
  /** Shown only while that field has that value. */
  when?: [field: string, value: string];
  /** Shown only while this holds (a section for some roles, or once something is loaded). */
  show?: (values: SheetValues, ctx: SheetCtx) => boolean;
  /** Read by the danger action only: the primary neither checks nor needs its fields. */
  forDanger?: boolean;
  fields: FieldSpec[];
};

export type SheetRequest = { method: "POST" | "PATCH" | "PUT" | "DELETE"; url: string; body?: unknown };

/**
 * Values whose keys start with `_` are what `load` brought that no field
 * holds (a record's name for the title, its product count for the note).
 */
export type SheetKind = {
  title: string | ((ctx: SheetCtx, values: SheetValues) => string);
  sub: string | ((ctx: SheetCtx, values: SheetValues) => string);
  wide?: boolean;
  steps?: string[];
  at?: number;
  /** A note at the top of the body, fixed or from what was loaded; nothing when empty. */
  guide?: string | ((values: SheetValues) => string);
  sections: SheetSection[];
  cur: SheetCurrency;
  note: string | ((values: SheetValues) => string);
  done: string | ((result: unknown, values: SheetValues) => string);
  /** Where the toast's action goes for a created record. */
  open?: (result: unknown) => string | null;
  /** The toast action's words. Default "Open". */
  openLabel?: string;
  /**
   * Where to go once saved instead of back to the page underneath: the next
   * sheet of the job ("Move some from …" opens the transfer). Replaces this
   * sheet's address, so Back does not reopen it.
   */
  next?: (result: unknown, values: SheetValues) => string | null;
  primary: string;
  /** The primary is drawn but cannot send while this holds (no room on the plan); the note says why. */
  primaryDisabled?: (values: SheetValues) => boolean;
  /** A link after the note ("Plan and billing"), while this gives one. */
  noteLink?: (values: SheetValues) => { label: string; href: string } | null;
  /** "danger": the primary is the danger outline — a sheet whose one job is a delete, asked before it sends. */
  primaryTone?: "danger";
  /** "Cancel" unless the kind says otherwise ("Add, then another" keeps the sheet open). */
  secondary?: string;
  danger?: {
    label: string;
    /** Offered only while this holds (the owner's "Delete category"). */
    show?: (ctx: SheetCtx, values: SheetValues) => boolean;
    ask: (ctx: SheetCtx, values: SheetValues) => Ask;
    request: (ctx: SheetCtx, values: SheetValues) => SheetRequest;
    done: string | ((values: SheetValues, result: unknown) => string);
  };
  /** Asked before the primary sends (Merge). */
  confirm?: (values: SheetValues, ctx: SheetCtx) => Ask;
  /** Opened to read only: every field drawn as it stands, and only "Close" (a bookkeeper on a category). */
  readOnly?: (ctx: SheetCtx, values: SheetValues) => boolean;
  /** Edit kinds: the current values. */
  load?: (ctx: SheetCtx) => Promise<SheetValues>;
  submit: (values: SheetValues, ctx: SheetCtx) => SheetRequest;
  /** React Query keys to refetch after a save. */
  invalidate: string[][];
  /** Every one of these, or the sheet does not open. */
  requires: Array<[RetailResource, RetailAction]>;
};
