import type { BinKind, BinState } from "@/lib/retail/bin";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import type { Ask } from "@/lib/workspace/ask";

/**
 * A record kind: what an area spec writes to put a record on RecordFrame
 * (00-foundations 5.6.7). Pure configuration over the record's view `R` as
 * its `GET` returns it; the frame draws the header, the bin banner, the strip,
 * the KPIs, the chart, the tabs and the details rail from it, and hides what
 * the viewer's role cannot do (the server checks again).
 */

export type Grant = [RetailResource, RetailAction];

/**
 * What an action does: open a sheet over the record (with the record's id
 * when `id` is set, and any `params` the sheet reads), go to a page, open a file in a new tab (a PDF to print),
 * print one the server logs (`print`: POSTed, its PDF opened in a new tab,
 * then the record and its Activity read again), download one, ask the `bin`
 * confirm, post to the server (asking first when it has an ask) and toast its
 * done words, or hand an event to the page (a dialog the page owns).
 */
export type RecordDo =
  | { sheet: string; id?: string; params?: Record<string, string> }
  | { href: string }
  | { open: string }
  | { print: string }
  | { download: string }
  | { confirm: "bin" }
  | { post: { url: string; body?: unknown; ask?: Ask; done: string } }
  | { event: string };

/**
 * A note under the header, drawn like the bin banner: a bold lead, its text,
 * and an action that posts ("Archived. Not on the till…" with "Sell it again").
 */
export type RecordBanner = {
  lead: string;
  text: string;
  /** "bad": the bin banner's red ("You stopped buying from Pamela…"); else the quiet note. */
  tone?: "bad";
  /** Drawn for roles holding `requires`; sent as a `POST` unless `method` says (`DELETE …/stop`). */
  action?: { label: string; post: string; method?: "POST" | "DELETE"; body: unknown; done: string; requires: Grant };
};

export type RecordAction = {
  key: string;
  label: string;
  tone?: "bad";
  /** A second line under a ⋯ item ("Managers and owners only"). */
  sub?: string;
  /** Any of these. Empty: everyone who can read the record. */
  requires: Grant[];
  do: RecordDo;
};

export type RecordStep = { label: string; state: "done" | "now" | "todo" };

export type ChipTone = "plain" | "gold" | "warn" | "bad" | "info" | "ok";
export type RecordChip = { label: string; tone: ChipTone };

export type RecordFigure = { label: string; value: string; tone?: "warn" };

export type RecordKpi = {
  label: string;
  value: string;
  /** The note's leading figure, in mono and its tone: "+18%", "07:58". */
  lead?: string;
  leadTone?: "ok" | "bad" | "warn" | "plain";
  note: string;
};

export type RecordChart = {
  title: string;
  /** "US$", "% of what was ordered". */
  unit?: string;
  chip?: RecordChip;
  /** A right-aligned sentence instead of a range: "Selling about 2.1 a day". */
  aside?: string;
  /** `label` names a bar in its tooltip; `tick` is its x label ("" to skip it), `label` when absent. */
  bars: Array<{ label: string; tick?: string; value: number; text: string }>;
  /** A y-axis tick: "US$20". */
  tick?: (value: number) => string;
  /** The one bar drawn dark (a sale's own hour); absent, the last. */
  mark?: number | null;
  footer?: { text: string; link?: { label: string; href: string } };
};

/**
 * A tab whose table is a list source opened with its parent filter set to
 * this record; its count is that source's total.
 */
export type SourceTab<R> = {
  key: string;
  label: string;
  source: string;
  /** The source's `parent` filter key: `shift`. */
  parent: string;
  /** Drawn only for roles holding this (the source refuses everyone else). */
  requires?: Grant;
  /** Drawn only while the record has something here (a sale's Refunds once it has one). */
  when?: (record: R) => boolean;
  /** The link to everything, filtered to this record; or one of the record's actions by key ("View the receipt" prints a copy). */
  allLink?: { label: string; href: (record: R) => string } | { label: string; action: string };
  /**
   * The source's columns this tab draws, in this order, and the header each
   * reads when it differs from the list's. Absent: every column the list shows.
   */
  columns?: Array<string | { key: string; label: string }>;
  /** Totals cells the engine cannot sum, from the record and the source's totals: "cash US$21.50 · card US$6.00". */
  totalsText?: (record: R, totals: Record<string, number | string | boolean | null>) => Record<string, string>;
};

export type ActivityTab = { key: "activity"; label: "Activity" };

export type RecordTab<R> = SourceTab<R> | ActivityTab;

export type RailEdit = {
  /** The field the `PATCH` body carries. */
  field: string;
  /**
   * `auto`: the lookup over `GET /api/v2/retail/lookup/<noun>` with quick add (5.7.5); it sends the picked id, or null.
   * `date`: the date picker; picking saves at once and sends the `YYYY-MM-DD`, or null from "Clear".
   */
  type: "text" | "money" | "number" | "auto" | "seg" | "date";
  /** `seg`: the choices, drawn as the sheet's segmented control; it sends the chosen word. */
  options?: string[];
  /** What the control starts with: the text, for `auto` the picked id, for `date` the `YYYY-MM-DD` or "". */
  initial: string;
  /** `date`: the first and last day that may be picked ("today" is today in the shop's zone). */
  earliest?: string | "today";
  latest?: string | "today";
  /** `date`: the picker draws "Clear", which sends null. */
  clearable?: boolean;
  /** `auto`: the noun looked up ("category") and what is picked now. */
  lookup?: { noun: string; picked: { id: string; label: string } | null; context?: Record<string, unknown> };
  mono?: boolean;
  /** The text typed, as the value sent; throws a sentence to show under it. */
  parse?: (text: string) => unknown;
  requires: Grant;
};

export type RailRow = {
  key: string;
  label: string;
  value: string;
  mono?: boolean;
  /** Drawn in `--ink-3` ("Not counted yet"). */
  muted?: boolean;
  edit?: RailEdit;
  /** Drawn only for roles holding this (a product's cost). */
  visible?: Grant;
};

export type RailGroup = {
  title: string;
  rows: RailRow[];
  /** Carries "click any value to change it" while this role may change a value anywhere on the rail. Default: the first group it may change. */
  hint?: boolean;
};

export type RailTop =
  | { meter: { label: string; value: string; pct: number; note: string } }
  | {
      photo: {
        url: string | null;
        prompt: string;
        sub: string;
        /** Changing it: upload, then `PATCH { [field]: url }`. */
        edit?: { field: string; upload: (file: File) => Promise<string>; requires: Grant };
      };
    };

export type RecordKind<R> = {
  /** The entity type its audit events are written under: "RetailShift". */
  type: string;
  back: { label: string; href: string };
  queryKey: (id: string) => readonly unknown[];
  load: (id: string) => Promise<R>;
  /** The record's own `PATCH` (W-62, 00-foundations 4.9). */
  endpoint?: (id: string) => string;
  title: (record: R) => string;
  reference?: (record: R) => string | null;
  /** At most three, as one group in the header. */
  actions?: (record: R) => RecordAction[];
  /** ⋯ items; "Export as PDF" first. */
  more?: (record: R) => RecordAction[];
  primary?: (record: R) => RecordAction | null;
  /** A note under the header while the record is in some state (archived); the bin banner wins. */
  banner?: (record: R) => RecordBanner | null;
  /** Binnable kinds add "Move to the bin" and draw the banner. */
  bin?: { kind: BinKind; deleteRight: Grant; state: (record: R) => BinState | null };
  steps?: (record: R) => RecordStep[];
  chips?: (record: R) => RecordChip[];
  figure?: (record: R) => RecordFigure | null;
  kpis?: (record: R) => RecordKpi[];
  /** The chart's range control (decision 10: only where the kind has one); `chart` gets the chosen key. */
  chartRanges?: { options: Array<{ key: string; label: string }>; initial: string };
  chart?: (record: R, range: string | null) => RecordChart | null;
  tabs: RecordTab<R>[];
  railTop?: (record: R) => RailTop | null;
  rail: (record: R) => RailGroup[];
  /** Other queries an edit or a bin move makes stale (the list the record is in). */
  invalidates?: ReadonlyArray<readonly unknown[]>;
};
