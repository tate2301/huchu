import type { LookupOption } from "@/lib/retail/lookups/types";
import { productsHint, SCOPE_LABEL, scopeOfLabel, startedToast } from "@/lib/retail/stock/count-words";
import type { StartedCount } from "@/lib/retail/stock/counts";
import type { PickedOption, SheetKind, SheetValues } from "@/lib/workspace/sheet-kind";

import { siteHoldingMost } from "./stock";

/**
 * Start a count (30-stock 5.6, `K.countnew`, board CountNew), over Counts, or
 * over On hand from "Count it" (`?id=`) and "Count these" (`?ids=`), which
 * open it on Some products with those lines. The hint under what is counted
 * says how many products that is, asked of the server as the choice changes.
 */

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as { error?: string; data?: T } | T | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error ?? "That could not be read. Close it and try again.");
  }
  return ((payload as { data?: T })?.data ?? payload) as T;
}

async function lookup(noun: string, context: Record<string, unknown> = {}): Promise<LookupOption[]> {
  const params = new URLSearchParams({ q: "", limit: "50", context: JSON.stringify(context) });
  const page = await readJson<{ options: LookupOption[] }>(`/api/v2/retail/lookup/${noun}?${params.toString()}`);
  return page.options;
}

const picked = (option: LookupOption): PickedOption => ({ id: option.id, label: option.label, sub: option.sub });
const one = (values: SheetValues, key: string) => (values[key] as PickedOption | null) ?? null;
const many = (values: SheetValues, key: string) => (Array.isArray(values[key]) ? (values[key] as PickedOption[]) : []);
const scopeOf = (values: SheetValues) => scopeOfLabel(values.scope);
const is = (scope: keyof typeof SCOPE_LABEL) => (values: SheetValues) => values.scope === SCOPE_LABEL[scope];

/** How many products the values would count, or null when nothing is chosen yet. */
async function previewOf(values: SheetValues): Promise<number | null> {
  const scope = scopeOf(values);
  const params = new URLSearchParams({ scope });
  const site = one(values, "site");
  if (site) params.set("siteId", site.id);
  if (scope === "CATEGORIES") {
    if (many(values, "cats").length === 0) return null;
    params.set("categoryIds", many(values, "cats").map((option) => option.id).join(","));
  } else if (scope === "PRODUCTS") {
    if (many(values, "lines").length === 0) return null;
    params.set("lineIds", many(values, "lines").map((option) => option.id).join(","));
  } else if (scope === "PLACE") {
    const place = one(values, "place");
    if (!place) return null;
    params.set("placeId", place.id);
  }
  const answer = await readJson<{ products: number }>(`/api/v2/retail/stock/counts/preview?${params.toString()}`);
  return answer.products;
}

/** After what is counted changes: the hint's figure again. */
const followPreview = async (_value: unknown, values: SheetValues): Promise<SheetValues> => ({ _products: await previewOf(values) });

const hint = (values: SheetValues) => (typeof values._products === "number" ? productsHint(values._products) : "");

const countNew: SheetKind = {
  title: "Start a count",
  sub: "Stock › Counts",
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "scope",
          t: "seg",
          l: "Count",
          v: SCOPE_LABEL.CATEGORIES,
          // "A place" only when the site has more than one place to be in.
          o: (values) => [
            SCOPE_LABEL.EVERYTHING,
            SCOPE_LABEL.CATEGORIES,
            SCOPE_LABEL.PRODUCTS,
            ...(Number(values._places ?? 0) > 1 ? [SCOPE_LABEL.PLACE] : []),
          ],
          h: (values) => (is("EVERYTHING")(values) ? hint(values) : ""),
          follow: followPreview,
        },
        {
          id: "cats",
          t: "tags",
          l: "Categories",
          noun: "category",
          p: "Add a category, then Enter",
          needed: "Add a category.",
          show: is("CATEGORIES"),
          h: hint,
          follow: followPreview,
        },
        {
          id: "lines",
          t: "tags",
          l: "Products",
          noun: "stock-line",
          p: "Add a product, then Enter",
          needed: "Add a product.",
          context: (_ctx, values) => ({ siteId: one(values, "site")?.id ?? "" }),
          show: is("PRODUCTS"),
          h: hint,
          follow: followPreview,
        },
        {
          id: "place",
          t: "auto",
          l: "Place",
          noun: "place",
          needed: "Pick a place.",
          context: (_ctx, values) => ({ siteId: one(values, "site")?.id ?? "" }),
          show: is("PLACE"),
          h: hint,
          follow: followPreview,
        },
        {
          id: "site",
          t: "auto",
          l: "At",
          noun: "site",
          show: (values) => values._multiSite === true,
          // Lines and places are a site's own: another site starts them again.
          follow: async (value, values) => {
            const site = (value as PickedOption | null) ?? null;
            const next = { ...values, lines: [], place: null };
            const places = site ? await lookup("place", { siteId: site.id }) : [];
            return {
              lines: [],
              place: null,
              _places: places.length,
              _leftOut: 0,
              ...(places.length <= 1 && is("PLACE")(values) ? { scope: SCOPE_LABEL.CATEGORIES } : {}),
              _products: await previewOf(next),
            };
          },
        },
        {
          id: "who",
          t: "auto",
          l: "Counted by",
          noun: "person",
          needed: "Pick who counts.",
          h: "They get a link on WhatsApp and count on their phone.",
        },
        {
          id: "blind",
          t: "toggle",
          l: "Blind count",
          v: true,
          h: "The counter does not see what the system expects. Counts come out truer.",
        },
        {
          id: "keepSelling",
          t: "toggle",
          l: "Keep selling while counting",
          v: true,
          h: "Sales during the count are allowed for, line by line.",
        },
      ],
    },
  ],
  note: (values) => {
    const left = Number(values._leftOut ?? 0);
    if (left > 0) return `${left} ${left === 1 ? "line" : "lines"} at ${String(values._leftOutAt ?? "another site")} ${left === 1 ? "was" : "were"} left out.`;
    return "Nothing changes until you approve the differences.";
  },
  done: (result, values) => {
    const count = result as StartedCount;
    return startedToast({
      countNo: count.countNo,
      lines: count.lines,
      counter: count.counter.name,
      self: count.counter.id === values._me,
      messaged: count.messaged,
    });
  },
  open: (result, values) => {
    const count = result as StartedCount;
    return count.counter.id === values._me ? `/retail/stock/counts/${count.id}/count` : `/retail/stock/counts/${count.id}`;
  },
  openLabel: (result, values) => ((result as StartedCount).counter.id === values._me ? "Count now" : "Open"),
  primary: "Start counting",
  load: async (ctx) => {
    const sites = await lookup("site");
    const fallback = sites.find((option) => option.sub === "Default") ?? sites[0] ?? null;
    const ids = (ctx.params.get("ids") ?? ctx.id ?? "").split(",").filter(Boolean);
    const ticked = ids.length > 0 ? await lookup("stock-line", { lineIds: ids }) : [];
    const atId = ticked.length > 0 ? siteHoldingMost(ticked, fallback?.id ?? null) : (fallback?.id ?? null);
    const site = sites.find((option) => option.id === atId) ?? fallback;
    const lines = ticked.filter((option) => option.siteId === site?.id).map(picked);
    const leftOut = ticked.filter((option) => option.siteId !== site?.id);

    const categoryId = ctx.params.get("category");
    const category = categoryId ? (await lookup("category")).find((option) => option.id === categoryId) : undefined;
    const places = site ? await lookup("place", { siteId: site.id }) : [];

    const values: SheetValues = {
      scope: lines.length > 0 ? SCOPE_LABEL.PRODUCTS : SCOPE_LABEL.CATEGORIES,
      cats: category ? [picked(category)] : [],
      lines,
      site: site ? picked(site) : null,
      who: { id: ctx.user.id, label: ctx.user.name, sub: null },
      _me: ctx.user.id,
      _multiSite: sites.length > 1,
      _places: places.length,
      _leftOut: leftOut.length,
      _leftOutAt: leftOut[0]?.site ?? null,
    };
    return { ...values, _products: await previewOf(values) };
  },
  submit: (values) => {
    const scope = scopeOf(values);
    return {
      method: "POST",
      url: "/api/v2/retail/stock/counts",
      body: {
        scope,
        ...(scope === "CATEGORIES" ? { categoryIds: many(values, "cats").map((option) => option.id) } : {}),
        ...(scope === "PRODUCTS" ? { lineIds: many(values, "lines").map((option) => option.id) } : {}),
        ...(scope === "PLACE" ? { placeId: one(values, "place")?.id } : {}),
        siteId: one(values, "site")?.id,
        counterId: one(values, "who")?.id,
        blind: values.blind === true,
        keepSelling: values.keepSelling === true,
      },
    };
  },
  invalidate: [["list", "retail-stock-counts"], ["nav-badges"]],
  requires: [["retail.counts", "create"]],
};

export const STOCK_COUNT_SHEETS: Record<string, SheetKind> = { "count-new": countNew };
