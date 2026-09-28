/**
 * A list's state as a URL, and back.
 *
 * The address bar is where a list's state lives: a link to "my overdue deals"
 * is a link somebody can send, the back button returns to the same slice after
 * opening a record, and a reload keeps what was on screen. The encoding is
 * meant to be read by a person:
 *
 *   ?q=roof&stage=QUOTED,WON&owner=me,none&close=this-month&value=1000..
 *     &sort=-updatedAt&layout=board&by=owner&view=closing
 *
 * - a list filter is a comma list; `owner` understands `me` and `none`;
 * - a date filter is `from..to` in days, either end open, or a preset word;
 * - a number filter is `min..max`;
 * - an on/off filter is `1`;
 * - a custom field is `cf.<field key>`, a comma list of the answers wanted;
 * - `sort` is a key, `-` in front for descending;
 * - `view` names where the state came from — a built-in view's key or a saved
 *   view's id. A URL carrying only `view` means "that view, as saved"; any
 *   other key makes the URL the whole state, so clearing a filter the view had
 *   survives a reload.
 *
 * Reading is lenient — a bad query string narrows nothing rather than failing
 * — and writing is canonical: keys in the register's order, values sorted,
 * empty answers left out. So one state has one string, and "has this view been
 * changed" is a string comparison.
 */
import {
  CUSTOM_FIELD_PREFIX,
  DATE_PRESETS,
  isCustomFieldKey,
  type DatePreset,
  type FilterDef,
  type FilterValue,
  type Layout,
  type RegisterDef,
  type ViewState,
} from "./types";

const LAYOUT_PARAM: Record<Layout, string> = { TABLE: "table", LIST: "list", BOARD: "board" };
const LAYOUT_FROM_PARAM: Record<string, Layout> = { table: "TABLE", list: "LIST", board: "BOARD" };

/** Keys the codec owns outside the register's filters. */
export const RESERVED_PARAMS = ["q", "sort", "layout", "by", "view", "page"] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VALUES = 50;
const MAX_VALUE_LENGTH = 120;
const MAX_CUSTOM_FIELDS = 20;
const CUSTOM_FIELD_KEY = /^cf\.[A-Za-z0-9_-]{1,60}$/;

/** How a custom field's answers are read and written: a list of values. */
const CUSTOM_FIELD_FILTER: FilterDef = { key: "cf", label: "Custom field", kind: "enum" };

function isPreset(value: string): value is DatePreset {
  return (DATE_PRESETS as readonly string[]).includes(value);
}

function parseNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** One filter's value from its query-string form, or undefined when it says nothing usable. */
export function readFilterValue(def: FilterDef, raw: string | null): FilterValue | undefined {
  if (raw === null) return undefined;
  const text = raw.trim();
  if (!text) return undefined;

  switch (def.kind) {
    case "boolean":
      return text === "1" || text.toLowerCase() === "true" ? true : undefined;
    case "date": {
      if (isPreset(text)) {
        return def.presets && !def.presets.includes(text) ? undefined : { preset: text };
      }
      const [from, to] = text.split("..");
      const range = {
        ...(from && DAY.test(from) ? { from } : {}),
        ...(to && DAY.test(to) ? { to } : {}),
      };
      return range.from || range.to ? range : undefined;
    }
    case "number": {
      const [min, max] = text.split("..");
      const range = {
        ...(min !== undefined && parseNumber(min) !== undefined ? { min: parseNumber(min) } : {}),
        ...(max !== undefined && parseNumber(max) !== undefined ? { max: parseNumber(max) } : {}),
      };
      return range.min !== undefined || range.max !== undefined ? range : undefined;
    }
    default: {
      const allowed = def.kind === "enum" && def.options ? new Set(def.options.map((o) => o.value)) : null;
      const values = [
        ...new Set(
          text
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part && part.length <= MAX_VALUE_LENGTH)
            .filter((part) => (allowed ? allowed.has(part) : true)),
        ),
      ].slice(0, MAX_VALUES);
      if (values.length === 0) return undefined;
      return def.single ? values.slice(0, 1) : values;
    }
  }
}

/** One filter's value in its query-string form, or null when it narrows nothing. */
export function writeFilterValue(def: FilterDef, value: FilterValue | undefined): string | null {
  if (value === undefined) return null;
  switch (def.kind) {
    case "boolean":
      return value === true ? "1" : null;
    case "date": {
      if (typeof value === "object" && "preset" in value) return value.preset;
      if (typeof value !== "object" || Array.isArray(value)) return null;
      const range = value as { from?: string; to?: string };
      if (!range.from && !range.to) return null;
      return `${range.from ?? ""}..${range.to ?? ""}`;
    }
    case "number": {
      if (typeof value !== "object" || Array.isArray(value)) return null;
      const range = value as { min?: number; max?: number };
      if (range.min === undefined && range.max === undefined) return null;
      return `${range.min ?? ""}..${range.max ?? ""}`;
    }
    default: {
      if (!Array.isArray(value)) return null;
      const values = [...new Set(value as string[])].filter(Boolean).sort();
      return values.length > 0 ? values.join(",") : null;
    }
  }
}

export type UrlState = {
  state: ViewState;
  /** The view the state came from, when the URL names one. */
  view: string | null;
  /** True when the URL carries only `view` (or nothing) — the view as saved. */
  asSaved: boolean;
  page: number;
};

/** `URLSearchParams`, or Next's read-only copy of one. */
type Params = { get(name: string): string | null; keys(): Iterable<string> };

/** Parse a list's URL. Unknown keys and unusable values are dropped. */
export function readState(def: RegisterDef, params: Params): UrlState {
  const filters: Record<string, FilterValue> = {};
  let explicit = false;

  for (const filter of def.filters) {
    const raw = params.get(filter.key);
    if (raw !== null) explicit = true;
    const value = readFilterValue(filter, raw);
    if (value !== undefined) filters[filter.key] = value;
  }

  const customKeys = [...new Set(params.keys())]
    .filter((key) => CUSTOM_FIELD_KEY.test(key))
    .sort()
    .slice(0, MAX_CUSTOM_FIELDS);
  for (const key of customKeys) {
    explicit = true;
    const value = readFilterValue(CUSTOM_FIELD_FILTER, params.get(key));
    if (value !== undefined) filters[key] = value;
  }

  const q = params.get("q")?.trim().slice(0, 200) || undefined;
  if (params.get("q") !== null) explicit = true;

  let sort: ViewState["sort"];
  const rawSort = params.get("sort");
  if (rawSort !== null) {
    explicit = true;
    const dir = rawSort.startsWith("-") ? "desc" : "asc";
    const key = rawSort.replace(/^-/, "");
    if (def.sorts.some((option) => option.key === key)) sort = { key, dir };
  }

  const rawLayout = params.get("layout");
  if (rawLayout !== null) explicit = true;
  const parsedLayout = rawLayout ? LAYOUT_FROM_PARAM[rawLayout.toLowerCase()] : undefined;
  const layout = parsedLayout && def.layouts.includes(parsedLayout) ? parsedLayout : undefined;

  const rawBy = params.get("by");
  if (rawBy !== null) explicit = true;
  const by = rawBy && def.groupBys?.some((group) => group.key === rawBy) ? rawBy : undefined;

  const view = params.get("view")?.trim() || null;
  const page = Math.max(1, Math.floor(Number(params.get("page") ?? "1")) || 1);

  return {
    state: {
      ...(q ? { q } : {}),
      filters,
      ...(sort ? { sort } : {}),
      ...(layout ? { layout } : {}),
      ...(by ? { by } : {}),
    },
    view,
    asSaved: !explicit,
    page,
  };
}

/**
 * The canonical query string for a state.
 *
 * `layout` is always written for an explicit state: it is what marks the URL
 * as the whole state rather than "the view, as saved", so a view whose filters
 * have all been cleared does not get them back on reload.
 */
export function writeState(
  def: RegisterDef,
  state: ViewState,
  options: { view?: string | null; page?: number; asSaved?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (!options.asSaved) {
    if (state.q?.trim()) params.set("q", state.q.trim());
    for (const filter of def.filters) {
      const written = writeFilterValue(filter, state.filters[filter.key]);
      if (written !== null) params.set(filter.key, written);
    }
    for (const key of Object.keys(state.filters).filter(isCustomFieldKey).sort()) {
      if (!CUSTOM_FIELD_KEY.test(key)) continue;
      const written = writeFilterValue(CUSTOM_FIELD_FILTER, state.filters[key]);
      if (written !== null) params.set(key, written);
    }
    if (state.sort) params.set("sort", `${state.sort.dir === "desc" ? "-" : ""}${state.sort.key}`);
    params.set("layout", LAYOUT_PARAM[state.layout ?? def.layouts[0]]);
    if (state.by) params.set("by", state.by);
  }
  if (options.view) params.set("view", options.view);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  return params.toString();
}

/** The part of a state that decides which records are in the list. */
export function narrowingKey(def: RegisterDef, state: ViewState): string {
  return writeState(def, { q: state.q, filters: state.filters });
}

/** Two states that show the same records, the same way. Columns compared in order. */
export function sameState(def: RegisterDef, a: ViewState, b: ViewState): boolean {
  if (writeState(def, withDefaults(def, a)) !== writeState(def, withDefaults(def, b))) return false;
  const ca = a.columns?.join(",") ?? "";
  const cb = b.columns?.join(",") ?? "";
  return ca === cb;
}

/** A state with the register's defaults filled in, so comparisons ignore what was never chosen. */
export function withDefaults(def: RegisterDef, state: ViewState): ViewState {
  return {
    ...state,
    layout: state.layout ?? def.layouts[0],
    sort: state.sort ?? (def.sorts[0] ? { key: def.sorts[0].key, dir: def.sorts[0].dir } : undefined),
  };
}

/** How many filters narrow anything — the phone's "Filters (n)". Search counts as one. */
export function activeFilterCount(state: ViewState): number {
  return Object.keys(state.filters).length + (state.q?.trim() ? 1 : 0);
}

/** The custom-field filters in a state, keyed by field key without the prefix. */
export function customFieldFilters(state: ViewState): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(state.filters)) {
    if (isCustomFieldKey(key) && Array.isArray(value)) {
      out[key.slice(CUSTOM_FIELD_PREFIX.length)] = value as readonly string[];
    }
  }
  return out;
}
