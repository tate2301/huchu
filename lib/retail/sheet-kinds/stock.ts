import type { LookupOption } from "@/lib/retail/lookups/types";
import type { SentTransfer } from "@/lib/retail/stock/transfers";
import { leftOutNote, sendNote, sentToast } from "@/lib/retail/stock/transfer-words";
import type { PickedOption, SheetKind, SheetLine, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Stock's sheets (30-stock 5.13): Move stock, over Transfers. It sends
 * through `POST /api/v2/retail/stock/transfers`.
 */

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as { error?: string; data?: T } | T | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error ?? "That could not be read. Close it and try again.");
  }
  return ((payload as { data?: T })?.data ?? payload) as T;
}

/** Options of a lookup noun, as many as one page holds. */
async function lookup(noun: string, context: Record<string, unknown> = {}): Promise<LookupOption[]> {
  const params = new URLSearchParams({ q: "", limit: "50", context: JSON.stringify(context) });
  const page = await readJson<{ options: LookupOption[] }>(`/api/v2/retail/lookup/${noun}?${params.toString()}`);
  return page.options;
}

const picked = (option: LookupOption): PickedOption => ({ id: option.id, label: option.label, sub: option.sub });

/** A stock line as a line of the sheet: "9 at Harare Main Branch", its cost when the person may see it. */
const asLine = (option: LookupOption, quantity: string): SheetLine => ({
  productId: option.id,
  name: option.label,
  sub: option.sub,
  quantity,
  cost: option.cost ?? "0.00",
  of: option.of ?? null,
});

/** The stock-line lookup's sub reads "9 at Harare Main Branch" in a transfer. */
const FOR_TRANSFER = "transfer";

const site = (values: SheetValues, key: "from" | "to") => (values[key] as PickedOption | null) ?? null;
const linesOf = (values: SheetValues) => (Array.isArray(values.lines) ? (values.lines as SheetLine[]) : []);

const invalidateTransfers = [
  ["list", "retail-stock-transfers"],
  ["list", "retail-stock-movements"],
  ["list", "retail-stock-on-hand"],
  ["lookup", "stock-line"],
];

/**
 * The site most of the ticked lines are at, so the fewest are left out; the
 * default site when it ties for most.
 */
export function siteHoldingMost(ticked: Pick<LookupOption, "siteId">[], defaultId: string | null): string | null {
  const counts = new Map<string, number>();
  for (const option of ticked) {
    if (option.siteId) counts.set(option.siteId, (counts.get(option.siteId) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [siteId, count] of counts) {
    const top = best === null ? 0 : counts.get(best)!;
    if (count > top || (count === top && siteId === defaultId)) best = siteId;
  }
  return best;
}

/**
 * Move stock (`K.transfer`, board TransferNew). From is the default site and
 * To the other one when there are exactly two; `?from=&to=` (Add a site's
 * "Move some from …") and `?ids=` (On hand's ticked lines, arriving with an
 * empty Sending figure) choose them instead. Changing From keeps the lines
 * whose products are kept at the new site and drops the rest, saying so.
 */
const transferNew: SheetKind = {
  title: "Move stock",
  sub: "Stock › Transfers",
  wide: true,
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "from",
          t: "auto",
          l: "From",
          noun: "site",
          half: true,
          follow: async (value, values) => {
            const from = (value as PickedOption | null) ?? null;
            const to = site(values, "to");
            const next: SheetValues = { _leftOut: 0, _leftOutAt: from?.label ?? null };
            if (from && to && to.id === from.id) next.to = await otherSite(from.id);
            const lines = linesOf(values);
            if (!from || lines.length === 0) return { ...next, lines: from ? lines : [] };
            const found = await lookup("stock-line", {
              siteId: from.id,
              productIds: lines.map((line) => line.of).filter(Boolean),
              for: FOR_TRANSFER,
            });
            const byProduct = new Map(found.map((option) => [option.of, option]));
            const kept = lines.flatMap((line) => {
              const option = line.of ? byProduct.get(line.of) : undefined;
              return option ? [asLine(option, line.quantity)] : [];
            });
            return { ...next, lines: kept, _leftOut: lines.length - kept.length };
          },
        },
        {
          id: "to",
          t: "auto",
          l: "To",
          noun: "site",
          half: true,
          context: (_ctx, values) => {
            const from = site(values, "from");
            return from ? { exclude: from.id } : {};
          },
        },
      ],
    },
    {
      title: "What goes",
      fields: [
        {
          id: "lines",
          t: "lines",
          l: "What goes",
          noun: "stock-line",
          ql: "Sending",
          cl: "Cost",
          // Only what is kept at From can go; a new product cannot be added here.
          p: "Add a product: search or scan",
          context: (_ctx, values) => ({ siteId: site(values, "from")?.id ?? "", for: FOR_TRANSFER }),
        },
      ],
    },
    {
      title: "On the way",
      fields: [
        { id: "who", t: "auto", l: "Taken by", noun: "person", half: true },
        { id: "when", t: "text", l: "Arrives", half: true, p: "Today, by 11:00" },
      ],
    },
  ],
  note: (values) => {
    const left = Number(values._leftOut ?? 0);
    if (left > 0) return leftOutNote(left, String(values._leftOutAt ?? "the new site"));
    return sendNote(site(values, "to")?.label ?? null);
  },
  done: (result) => {
    const sent = result as SentTransfer;
    return sentToast(sent.transferNo, sent.to.name);
  },
  open: (result) => `/retail/stock/transfers/${(result as SentTransfer).id}`,
  primary: "Send",
  load: async (ctx) => {
    const sites = await lookup("site");
    const byId = (id: string | null) => sites.find((option) => option.id === id) ?? null;
    const ids = (ctx.params.get("ids") ?? ctx.id ?? "").split(",").filter(Boolean);
    const ticked = ids.length > 0 ? await lookup("stock-line", { lineIds: ids, for: FOR_TRANSFER }) : [];

    const fallback = sites.find((option) => option.sub === "Default") ?? sites[0] ?? null;
    const from = byId(ctx.params.get("from")) ?? byId(siteHoldingMost(ticked, fallback?.id ?? null)) ?? fallback;
    const others = sites.filter((option) => option.id !== from?.id);
    const asked = byId(ctx.params.get("to"));
    const to = asked && asked.id !== from?.id ? asked : others.length === 1 ? others[0]! : null;
    const lines = ticked.filter((option) => option.siteId === from?.id).map((option) => asLine(option, ""));
    return {
      from: from ? picked(from) : null,
      to: to ? picked(to) : null,
      lines,
      _leftOut: ticked.length - lines.length,
      _leftOutAt: from?.label ?? null,
    };
  },
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/stock/transfers",
    body: {
      fromSiteId: site(values, "from")?.id,
      toSiteId: site(values, "to")?.id,
      lines: linesOf(values).map((line) => ({ lineId: line.productId, quantity: line.quantity.trim() })),
      takenById: (values.who as PickedOption | null)?.id,
      arrives: typeof values.when === "string" ? values.when.trim() : "",
    },
  }),
  invalidate: invalidateTransfers,
  requires: [["retail.transfers", "create"]],
};

/** The other open site, when there is exactly one other. */
async function otherSite(fromId: string): Promise<PickedOption | null> {
  const others = (await lookup("site")).filter((option) => option.id !== fromId);
  return others.length === 1 ? picked(others[0]!) : null;
}

export const STOCK_SHEETS: Record<string, SheetKind> = {
  "transfer-new": transferNew,
};
