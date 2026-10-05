import type { LookupOption } from "@/lib/retail/lookups/types";
import type { ChangedTransfer, ReceivedTransfer } from "@/lib/retail/stock/transfer-changes";
import type { TransferView } from "@/lib/retail/stock/transfer-record";
import type { SentTransfer } from "@/lib/retail/stock/transfers";
import {
  cameSub,
  leftOutNote,
  receiveHint,
  routeWords,
  sendNote,
  sentToast,
  sentWords,
  type ShortLine,
} from "@/lib/retail/stock/transfer-words";
import type { PickedOption, SheetKind, SheetLine, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Stock's sheets (30-stock 5.13, 5.15, 5.16): Move stock, over Transfers;
 * Receive a transfer and Change the lines, over the transfer (or the list).
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

/** The transfer a sheet is opened for (`?id=`). */
async function transferFor(id: string | null): Promise<TransferView> {
  if (!id) throw new Error("Open this from a transfer.");
  return readJson<TransferView>(`/api/v2/retail/stock/transfers/${id}`);
}

const invalidateTransfer = [...invalidateTransfers, ["retail-stock-transfer"], ["record-activity"], ["reports"], ["nav-badges"]];

/** What each receive line still has to come, by transfer line. */
const toComeOf = (values: SheetValues) => (values._toCome as Record<string, number> | undefined) ?? {};

/** Lines whose Came is less than what is still to come, and by how much. */
export function shortOf(values: SheetValues): ShortLine[] {
  const toCome = toComeOf(values);
  return linesOf(values).flatMap((line) => {
    const came = Number(line.quantity.trim() || "0");
    const short = (toCome[line.productId] ?? 0) - (Number.isFinite(came) ? came : 0);
    return short > 0 ? [{ name: line.name, short }] : [];
  });
}

const SHORT = { still: "Still coming", lost: "Lost on the way" } as const;

/**
 * Receive a transfer (`K.transferreceive`, board TransferReceive): the lines
 * still to come, prefilled with what is to come; Came less than that turns
 * the line's sub `--warn`, says what is short under the lines, and asks
 * whether it is still coming or lost on the way.
 */
const transferReceive: SheetKind = {
  title: (_ctx, values) => `Receive ${String(values._transferNo ?? "the transfer")}`,
  sub: (_ctx, values) => String(values._sub ?? ""),
  wide: true,
  cur: "US$",
  sections: [
    {
      title: "Count what came",
      fields: [
        {
          id: "lines",
          t: "lines",
          l: "What came",
          noun: "stock-line",
          ql: "Came",
          cl: "Cost",
          // Nothing can arrive that was not sent.
          closed: true,
          lineWarn: (line, values) => Number(line.quantity.trim() || "0") < (toComeOf(values)[line.productId] ?? 0),
          h: (values) => receiveHint(shortOf(values), String(values._from ?? "the other site")),
        },
      ],
    },
    {
      title: "The difference",
      show: (values) => shortOf(values).length > 0,
      fields: [{ id: "short", t: "seg", l: "What is short", o: [SHORT.still, SHORT.lost], v: SHORT.lost }],
    },
  ],
  note: (values) => `Received stock is on sale at ${String(values._to ?? "the other site")} at once.`,
  done: (result) => (result as ReceivedTransfer).message,
  primary: "Receive",
  load: async (ctx) => {
    const transfer = await transferFor(ctx.id ?? ctx.params.get("id"));
    const open = transfer.lines.filter((line) => line.toCome > 0);
    return {
      _transferNo: transfer.transferNo,
      _sub: `From ${transfer.from.name} · sent ${sentWords(transfer.sentAt, new Date(transfer.now))} by ${transfer.sentBy}`,
      _from: transfer.from.name,
      _to: transfer.to.name,
      _toCome: Object.fromEntries(open.map((line) => [line.id, line.toCome])),
      lines: open.map(
        (line): SheetLine => ({
          productId: line.id,
          name: line.product.name,
          sub: cameSub(line.sent, line.toCome),
          quantity: String(line.toCome),
          cost: (line.unitCost ?? 0).toFixed(2),
          of: line.product.id,
        }),
      ),
      short: SHORT.lost,
    };
  },
  submit: (values, ctx) => ({
    method: "POST",
    url: `/api/v2/retail/stock/transfers/${ctx.id ?? ctx.params.get("id")}/receive`,
    body: {
      lines: linesOf(values).map((line) => ({ id: line.productId, received: line.quantity.trim() })),
      short: values.short === SHORT.still ? "STILL_COMING" : "LOST",
    },
  }),
  invalidate: invalidateTransfer,
  requires: [["retail.transfers", "update"]],
};

/**
 * Change the lines (5.16, **Defined here**, reuses TransferNew): From and To
 * read only, the "What goes" lines prefilled with what is on the way; each
 * difference leaves or comes back to From's stock when saved.
 */
const transferLines: SheetKind = {
  title: "Change the lines",
  sub: (_ctx, values) => `${String(values._transferNo ?? "")} · ${routeWords(String(values._from ?? ""), String(values._to ?? ""))}`,
  wide: true,
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "from", t: "read", l: "From", half: true },
        { id: "to", t: "read", l: "To", half: true },
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
          p: "Add a product: search or scan",
          context: (_ctx, values) => ({ siteId: String(values._fromId ?? ""), for: FOR_TRANSFER }),
        },
      ],
    },
  ],
  note: (values) => `Changes leave or come back to ${String(values._from ?? "the site it left")}’s stock now.`,
  done: (result) => (result as ChangedTransfer).message,
  primary: "Save",
  load: async (ctx) => {
    const transfer = await transferFor(ctx.id ?? ctx.params.get("id"));
    const found = await lookup("stock-line", {
      lineIds: transfer.lines.map((line) => line.fromLineId),
      for: FOR_TRANSFER,
    });
    const byLine = new Map(found.map((option) => [option.id, option]));
    return {
      _transferNo: transfer.transferNo,
      _from: transfer.from.name,
      _fromId: transfer.from.id,
      _to: transfer.to.name,
      from: transfer.from.name,
      to: transfer.to.name,
      lines: transfer.lines.map((line): SheetLine => {
        const option = byLine.get(line.fromLineId);
        return option
          ? asLine(option, String(line.sent))
          : {
              productId: line.fromLineId,
              name: line.product.name,
              sub: null,
              quantity: String(line.sent),
              cost: (line.unitCost ?? 0).toFixed(2),
              of: line.product.id,
            };
      }),
    };
  },
  submit: (values, ctx) => ({
    method: "PUT",
    url: `/api/v2/retail/stock/transfers/${ctx.id ?? ctx.params.get("id")}/lines`,
    body: { lines: linesOf(values).map((line) => ({ lineId: line.productId, quantity: line.quantity.trim() })) },
  }),
  invalidate: invalidateTransfer,
  requires: [["retail.transfers", "update"]],
};

export const STOCK_SHEETS: Record<string, SheetKind> = {
  "transfer-new": transferNew,
  "transfer-receive": transferReceive,
  "transfer-lines": transferLines,
};
