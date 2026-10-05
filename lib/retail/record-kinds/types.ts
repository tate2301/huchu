import type { BinKind, BinState } from "@/lib/retail/bin";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";

/**
 * A record kind: what an area spec writes to put a record on RecordFrame
 * (00-foundations 5.6.7). Pure configuration over the record's view `R` as
 * its `GET` returns it; the frame draws the header, the bin banner, the strip,
 * the KPIs, the chart, the tabs and the details rail from it, and hides what
 * the viewer's role cannot do (the server checks again).
 */

export type Grant = [RetailResource, RetailAction];

/**
 * What an action does: open a sheet over the record, go to a page, open a
 * file in a new tab (a PDF to print), download one, ask the `bin` confirm, or
 * hand an event to the page (a dialog the page owns).
 */
export type RecordDo =
  | { sheet: string }
  | { href: string }
  | { open: string }
  | { download: string }
  | { confirm: "bin" }
  | { event: string };

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
  bars: Array<{ label: string; value: number; text: string }>;
  /** A y-axis tick: "US$20". */
  tick?: (value: number) => string;
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
  /** The link to everything, filtered to this record. */
  allLink?: { label: string; href: (record: R) => string };
  /** A totals cell the engine cannot sum: "cash US$21.50 · card US$6.00". */
  totalsText?: (record: R) => Record<string, string>;
};

export type ActivityTab = { key: "activity"; label: "Activity" };

export type RecordTab<R> = SourceTab<R> | ActivityTab;

export type RailEdit = {
  /** The field the `PATCH` body carries. */
  field: string;
  type: "text" | "money" | "number" | "select";
  /** What the control starts with. */
  initial: string;
  options?: Array<{ value: string; label: string }>;
  /** Options read when the row opens, for a `select` whose choices are the shop's own. */
  loadOptions?: { key: readonly unknown[]; load: () => Promise<Array<{ value: string; label: string }>> };
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

export type RailGroup = { title: string; rows: RailRow[] };

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
  /** Binnable kinds add "Move to the bin" and draw the banner. */
  bin?: { kind: BinKind; deleteRight: Grant; state: (record: R) => BinState | null };
  steps?: (record: R) => RecordStep[];
  chips?: (record: R) => RecordChip[];
  figure?: (record: R) => RecordFigure | null;
  kpis?: (record: R) => RecordKpi[];
  chart?: (record: R) => RecordChart | null;
  tabs: RecordTab<R>[];
  railTop?: (record: R) => RailTop | null;
  rail: (record: R) => RailGroup[];
  /** Other queries an edit or a bin move makes stale (the list the record is in). */
  invalidates?: ReadonlyArray<readonly unknown[]>;
};
