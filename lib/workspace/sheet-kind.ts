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
export type PickedOption = {
  id: string;
  label: string;
  sub?: string | null;
  cost?: string | null;
  /** The record the option is of: a stock line's product. */
  of?: string | null;
};

/** One line of a `lines` field. */
export type SheetLine = {
  /** What the line sends: a product, or a stock line for a noun over lines. */
  productId: string;
  name: string;
  sub: string | null;
  warn?: boolean;
  quantity: string;
  cost: string;
  /** The record the picked option is of (a stock line's product). */
  of?: string | null;
  /** The person typed this line's figure: values worked out for the sheet leave it alone. */
  touched?: boolean;
};

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
  | "photo"
  /** A document sent with the request as multipart (a spreadsheet to import); the value is the File. */
  | "file";

export type FieldSpec = {
  id: string;
  t: FieldType;
  /** The label. */
  l: string;
  /** The label worked out from what was loaded ("On Back till now"); `l` stays the name in messages. */
  lw?: (values: SheetValues) => string;
  /** The starting value, or how to work it out from the context. */
  v?: unknown | ((ctx: SheetCtx) => unknown);
  /** Placeholder. */
  p?: string;
  /** Hint under the control. */
  h?: string | ((values: SheetValues) => string);
  half?: boolean;
  /** Optional: a field without it is required. */
  opt?: boolean;
  /** With `opt`: optional without the word "optional" beside the label (the board leaves it off). */
  optQuiet?: boolean;
  mono?: boolean;
  right?: boolean;
  /** `text`: upper case as typed (a short code). */
  upper?: boolean;
  /** `text`: typed digits hidden, a number pad on a phone (a manager's PIN). */
  masked?: boolean;
  /** `text`: at most this many characters. */
  max?: number;
  /** `photo`: the upload route (`POST` multipart → `{ data: { url } }`); the product image route when absent. */
  upload?: string;
  /** `read`: the value in that tone, always or as the values say ("Paired" ok, "Not paired yet" warn). */
  tone?: "ok" | "warn" | ((values: SheetValues) => "ok" | "warn" | undefined);
  /** `read`: kept to one line a size smaller, cut short with its whole text on hover (a half-width "Cases 22 → 21, singles 26 → 50"). */
  oneLine?: boolean;
  /** `read`: a QR code of this payload beside the value, drawn in the browser (a pairing code for a Kora). */
  qr?: (values: SheetValues) => string | null;
  /** The hint in `--warn`, always or while this holds (the default site switched off). */
  warn?: boolean | ((values: SheetValues) => boolean);
  /**
   * `seg` labels, `text` choices (a select drawn as text), or `cards` as
   * [label, description?, badge?]; or worked out from what was loaded ("Move
   * some from Harare Main Branch").
   */
  o?:
    | string[]
    | Array<[label: string, sub?: string, badge?: string]>
    | ((values: SheetValues) => string[] | Array<[label: string, sub?: string, badge?: string]>);
  cols?: number;
  rows?: number;
  /** `area`: grows with what is typed, a row a line, up to this many rows (never below `rows`). */
  maxRows?: number;
  /**
   * `auto`, `lines` and `tags`: the lookup noun (`GET /api/v2/retail/lookup/<noun>`).
   * A `tags` field with a noun holds picked options (`PickedOption[]`), not words.
   */
  noun?: string;
  /**
   * `auto`, `lines` and noun `tags`: narrows the lookup (`?context=`), e.g. `{ sells: true }`,
   * or from the sheet's address and the other values (the stock lines at From).
   */
  context?: Record<string, unknown> | ((ctx: SheetCtx, values: SheetValues) => Record<string, unknown>);
  /** `lines`: only the lines loaded — no add row, no remove (a receipt: nothing arrives that was not sent). */
  closed?: boolean;
  /** `lines`: a line drawn in `--warn` while this holds (Came less than was sent). */
  lineWarn?: (line: SheetLine, values: SheetValues) => boolean;
  /** `lines`: the quantity and cost column labels. */
  ql?: string;
  cl?: string;
  cur?: SheetCurrency;
  /** `money`: decimals kept, two at least (a rate keeps four). */
  decimals?: number;
  nolabel?: boolean;
  /** `photo` and `file`: the value line while empty ("Add your logo"). */
  prompt?: string;
  /** `file`: the line under the prompt ("Or choose a file · .xlsx or .csv"), and the types it takes. */
  fileSub?: string;
  accept?: string;
  /**
   * Draws the field as `read`, holding a fixed value, when the person may not
   * choose (a cashier opening their own shift sees themselves).
   */
  fixed?: (ctx: SheetCtx) => { value: unknown; shown: string } | null;
  /** `tags`: the last tag cannot be removed (a site keeps at least one place). */
  keepOne?: boolean;
  /**
   * Follows the other values until the person types in it (a short code
   * suggested from the name, a PIN toggle that follows the role card).
   * Worked out from every value, `_` facts included.
   */
  derive?: (values: SheetValues) => unknown;
  /** The message when a required field is empty ("Write their name."), instead of "<label> is needed.". */
  needed?: string;
  /** Drawn as `read` while this holds (every field of someone whose access was removed). */
  readWhen?: (values: SheetValues, ctx: SheetCtx) => boolean;
  /** `tags`: only these may be added, offered as the person types ("All sites", each site). */
  tagOptions?: (values: SheetValues) => string[];
  /** `tags`: the tag that stands for all of them: picking it removes the rest, picking another removes it. */
  tagAll?: string;
  /** Checked on a non-empty value before sending: the endpoint's own rule. */
  schema?: ZodType;
  /** Drawn but not changeable while this holds (hours while licence hours are off). */
  disabled?: (values: SheetValues) => boolean;
  /** Drawn only while this holds; a field not drawn is neither checked nor needed. */
  show?: (values: SheetValues, ctx: SheetCtx) => boolean;
  /**
   * After the person changes this field, other values follow: worked out
   * (from the server if need be) and merged in, unless the field has changed
   * again meanwhile. Changing From drops the lines not kept at the new site.
   */
  follow?: (value: unknown, values: SheetValues, ctx: SheetCtx) => Promise<SheetValues | null>;
};

export type SheetSection = {
  title?: string;
  /** Folded behind a dashed button: [label, hint]. */
  fold?: [label: string, hint: string];
  /** Shown only while that field has that value (a toggle's `true`). */
  when?: [field: string, value: string | boolean];
  /** Shown only while this holds (a section for some roles, or once something is loaded). */
  show?: (values: SheetValues, ctx: SheetCtx) => boolean;
  /** Read by the danger action only: the primary neither checks nor needs its fields. */
  forDanger?: boolean;
  fields: FieldSpec[];
};

/** A body holding a File (a `file` field's value) goes as multipart form data, its other keys as text. */
export type SheetRequest = { method: "POST" | "PATCH" | "PUT" | "DELETE"; url: string; body?: unknown };

/**
 * What the sheet shows instead of closing when a save could not deliver a
 * secret (a WhatsApp invite or PIN that did not go): the sentence, then the
 * link and the PIN for whoever issued them, shown once.
 */
export type HandOverPanel = { line: string; link: string | null; pin: string | null };

/**
 * Values whose keys start with `_` are what `load` brought that no field
 * holds (a record's name for the title, its product count for the note).
 */
export type SheetKind = {
  title: string | ((ctx: SheetCtx, values: SheetValues) => string);
  sub: string | ((ctx: SheetCtx, values: SheetValues) => string);
  wide?: boolean;
  /** "matrix": 1120px (less 56 on a narrower screen), for the Who can do what table. */
  size?: "matrix";
  /** A body drawn by a component instead of sections (`components/sheet-form/views.tsx`): "roles". */
  view?: string;
  /** A link-styled action under the sub ("Send the invite again"), while this gives one. */
  headLink?: (
    ctx: SheetCtx,
    values: SheetValues,
  ) => { label: string; request: SheetRequest; done: (payload: unknown) => string } | null;
  /** After a save or the head link: the hand-over panel instead of closing, when the answer carries one. */
  handOver?: (payload: unknown, values: SheetValues) => HandOverPanel | null;
  steps?: string[];
  at?: number;
  /** A note at the top of the body, fixed or from what was loaded; nothing when empty. */
  guide?: string | ((values: SheetValues) => string);
  sections: SheetSection[];
  cur: SheetCurrency;
  note: string | ((values: SheetValues) => string);
  /** The toast: fixed, or from the answer's `data` (`result`), the values, and the whole answer (`{ data, message }`). */
  done: string | ((result: unknown, values: SheetValues, payload: unknown) => string);
  /** Where the toast's action goes for a created record. */
  open?: (result: unknown, values: SheetValues) => string | null;
  /** The toast action's words, fixed or from the answer ("Count now" on a count that is yours). Default "Open". */
  openLabel?: string | ((result: unknown, values: SheetValues) => string);
  /**
   * Where to go once saved instead of back to the page underneath: the next
   * sheet of the job ("Move some from …" opens the transfer). Replaces this
   * sheet's address, so Back does not reopen it.
   */
  next?: (result: unknown, values: SheetValues) => string | null;
  /** The primary's words, fixed or from the values ("Save", or "Give access back" for someone without access). */
  primary: string | ((values: SheetValues) => string);
  /** The primary is drawn but cannot send while this holds (no room on the plan); the note says why. */
  primaryDisabled?: (values: SheetValues) => boolean;
  /** A link after the note ("Plan and billing"), while this gives one. */
  noteLink?: (values: SheetValues) => { label: string; href: string } | null;
  /** "danger": the primary is the danger outline — a sheet whose one job is a delete, asked before it sends. */
  primaryTone?: "danger";
  /** "Cancel" unless the kind says otherwise ("Add, then another" keeps the sheet open). */
  secondary?: string;
  /**
   * "Add, then another": the values kept for the next one (Category, At,
   * Sold as); every other field starts again empty. Without it, all of them do.
   */
  again?: { keep: string[] };
  danger?: {
    /** Fixed, or from the values ("Archive", or "Sell it again" on an archived product). */
    label: string | ((values: SheetValues) => string);
    /** Offered only while this holds (the owner's "Delete category"). */
    show?: (ctx: SheetCtx, values: SheetValues) => boolean;
    /** Asked before it sends; null sends at once (bringing something back asks nothing). */
    ask: (ctx: SheetCtx, values: SheetValues) => Ask | null;
    request: (ctx: SheetCtx, values: SheetValues) => SheetRequest;
    done: string | ((values: SheetValues, result: unknown) => string);
  };
  /** Asked before the primary sends (Merge). */
  confirm?: (values: SheetValues, ctx: SheetCtx) => Ask;
  /** Opened to read only: every field drawn as it stands, and only "Close" (a bookkeeper on a category). */
  readOnly?: (ctx: SheetCtx, values: SheetValues) => boolean;
  /** Edit kinds: the current values. */
  load?: (ctx: SheetCtx) => Promise<SheetValues>;
  /**
   * Asked again every `every` ms while open; what it returns is merged into
   * the values and into what counts as unchanged (a pairing code's state).
   * `left` aborts the moment the sheet is left: a run in flight must not
   * start anything new after it (no fresh code once Cancel expired one).
   */
  poll?: { every: number; run: (ctx: SheetCtx, values: SheetValues, left: AbortSignal) => Promise<SheetValues | null> };
  /**
   * Sent once when the sheet is left without saving — Cancel, ×, Esc,
   * Discard, Back, another page, a reload — after any poll in flight has
   * settled: the till Pair a till made goes, a pairing code stops.
   */
  cancel?: (ctx: SheetCtx, values: SheetValues) => SheetRequest | null;
  /** The secondary as a way on instead of Cancel ("Pair another device"), while this gives one. */
  secondaryLink?: (ctx: SheetCtx, values: SheetValues) => { label: string; href: string } | null;
  /**
   * A refusal's answer merged into the values, so the sheet can show what it
   * asks for: a 409 `needsApprover` reveals the manager's approval section.
   */
  onRefused?: (payload: unknown, values: SheetValues) => SheetValues | null;
  /** Null: nothing to send; the primary is done at once (a code that paired on its own). */
  submit: (values: SheetValues, ctx: SheetCtx) => SheetRequest | null;
  /** React Query keys to refetch after a save. */
  invalidate: string[][];
  /** Every one of these, or the sheet does not open. */
  requires: Array<[RetailResource, RetailAction]>;
};
