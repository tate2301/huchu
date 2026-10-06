import type { StockLineView } from "@/lib/retail/stock/lines";
import type { PickedOption, SheetCtx, SheetKind, SheetValues } from "@/lib/workspace/sheet-kind";
import { formatCount, formatMoney } from "@/lib/workspace/format";

/**
 * Adjust stock and Break a case (30-stock W-23, W-26; boards StockAdjust and
 * BreakCase): sheets over the product record, opened with `?productId=`
 * (and `&siteId=` from On hand's row menu).
 */

type LinesAnswer = { data: StockLineView[]; siteCount: number; defaultSiteId: string | null; pinOver: string };

async function readLines(params: Record<string, string>): Promise<LinesAnswer> {
  const response = await fetch(`/api/v2/retail/stock/lines?${new URLSearchParams(params).toString()}`, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as (LinesAnswer & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? "That could not be read. Close it and try again.");
  return payload;
}

const productOf = (ctx: SheetCtx) => ctx.params.get("productId") ?? ctx.id ?? "";

/** The line at the site asked, else the default site's, else the first. */
function pickLine(lines: StockLineView[], siteId: string | null, defaultSiteId: string | null): StockLineView | null {
  return (
    (siteId ? lines.find((line) => line.site.id === siteId) : undefined) ??
    lines.find((line) => line.site.id === defaultSiteId) ??
    lines[0] ??
    null
  );
}

const count = (value: number) => (Number.isInteger(value) ? formatCount(value) : String(value));

/* ── Adjust stock ───────────────────────────────────────────────────────── */

/** The cards, in the board's order, and the reason each sends. */
const WHYS: Array<[label: string, description: string, why: string]> = [
  ["Broken or spoilt", "Comes off stock and shows in Losses.", "BROKEN"],
  ["Own use or gift", "Comes off at cost. Who took it is noted.", "OWN_USE"],
  ["Found more", "Goes up. Usually a count is better.", "FOUND"],
  ["Fix a mistake", "Set the number on hand.", "CORRECTION"],
];
const FIX = "Fix a mistake";

const whyOf = (values: SheetValues) => WHYS.find(([label]) => label === values.why)?.[2] ?? "BROKEN";

/** The change the values would make, as the server works it out; null until a number is typed. */
export function plannedDelta(values: SheetValues): number | null {
  const typed = typeof values.n === "string" ? values.n.trim().replace(/,/g, "") : "";
  if (!/^\d+(\.\d+)?$/.test(typed)) return null;
  const n = Number(typed);
  const onHand = Number(values._onHand ?? 0);
  const why = whyOf(values);
  return why === "FOUND" ? n : why === "CORRECTION" ? n - onHand : -n;
}

/** What it is worth at cost: |change| × the line's cost. */
export function plannedValue(values: SheetValues): number {
  const delta = plannedDelta(values);
  return delta === null ? 0 : Math.round(Math.abs(delta) * Number(values._cost ?? 0) * 100) / 100;
}

/** The approval section: after the server asked for it, or once the value is over the limit, for someone who is not their own approval. */
const needsApproval = (values: SheetValues) =>
  values._canApprove !== true && (values._needsApprover === true || plannedValue(values) > Number(values._pinOver ?? Infinity));

/** What the sheet reads off one line. */
function lineFacts(line: StockLineView | null) {
  return {
    _onHand: line?.onHand ?? 0,
    _unit: line?.unit ?? "each",
    _site: line?.site.name ?? "",
    _cost: line?.unitCost ?? 0,
  };
}

const stockAdjust: SheetKind = {
  title: "Adjust stock",
  sub: (_ctx, values) => {
    if (!values._name) return "";
    const at = Number(values._siteCount ?? 1) >= 2 && values._site ? ` at ${String(values._site)}` : "";
    return `${String(values._name)} · ${count(Number(values._onHand ?? 0))} on hand${at}`;
  },
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "siteId",
          t: "auto",
          l: "Site",
          noun: "site",
          show: (values) => Number(values._lineCount ?? 0) >= 2,
          follow: async (value, _values, ctx) => {
            const site = (value as PickedOption | null) ?? null;
            if (!site) return null;
            const answer = await readLines({ productId: productOf(ctx), siteId: site.id });
            return { ...lineFacts(answer.data[0] ?? null), _site: site.label };
          },
        },
        { id: "why", t: "cards", l: "Why", nolabel: true, cols: 2, o: WHYS.map(([label, description]): [string, string] => [label, description]), v: WHYS[0]![0] },
        {
          id: "n",
          t: "text",
          l: "How many",
          lw: (values) => (values.why === FIX ? "On hand now" : "How many"),
          mono: true,
          right: true,
          half: true,
          v: "1",
          needed: "Say how many.",
        },
        {
          id: "atCost",
          t: "read",
          l: "At cost",
          mono: true,
          right: true,
          half: true,
          show: (_values, ctx) => ctx.can("retail.catalog", "view-cost"),
          derive: (values) => formatMoney(plannedValue(values)),
        },
        {
          id: "note",
          t: "area",
          l: "What happened",
          rows: 2,
          p: "What happened, and for own use who took it",
          needed: "Say what happened.",
        },
        {
          id: "photoUrl",
          t: "photo",
          l: "Photo",
          opt: true,
          prompt: "Add a photo",
          upload: "/api/v2/retail/stock/adjustments/photo",
        },
      ],
    },
    {
      title: "Manager’s approval",
      show: (values) => needsApproval(values),
      fields: [
        {
          id: "approver",
          t: "auto",
          l: "Manager",
          noun: "person",
          half: true,
          context: { can: "retail.adjustments:approve" },
          h: "A manager types their PIN to approve it.",
          needed: "Pick a manager.",
        },
        { id: "pin", t: "text", l: "PIN", mono: true, half: true, masked: true, max: 4, needed: "Type the manager’s four-digit PIN." },
      ],
    },
  ],
  note: (values) => `Over US$${String(values._pinOver ?? "50.00")} needs a manager PIN. Every adjustment shows in Activity.`,
  done: (_result, _values, payload) => (payload as { message?: string } | null)?.message ?? "Saved.",
  primary: "Save",
  load: async (ctx) => {
    const productId = productOf(ctx);
    if (!productId) throw new Error("Open this from a product.");
    const answer = await readLines({ productId });
    const line = pickLine(answer.data, ctx.params.get("siteId"), answer.defaultSiteId);
    return {
      _name: line?.product.name ?? "",
      _siteCount: answer.siteCount,
      _lineCount: answer.data.length,
      _pinOver: answer.pinOver,
      _canApprove: ctx.can("retail.adjustments", "approve"),
      ...lineFacts(line),
      siteId: line ? { id: line.site.id, label: line.site.name } : null,
    };
  },
  onRefused: (payload) => ((payload as { needsApprover?: boolean } | null)?.needsApprover ? { _needsApprover: true } : null),
  submit: (values, ctx) => {
    const approver = (values.approver as PickedOption | null) ?? null;
    const pin = typeof values.pin === "string" ? values.pin.trim() : "";
    return {
      method: "POST",
      url: "/api/v2/retail/stock/adjustments",
      body: {
        productId: productOf(ctx),
        siteId: (values.siteId as PickedOption | null)?.id ?? null,
        why: whyOf(values),
        n: typeof values.n === "string" ? values.n.trim() : "",
        note: typeof values.note === "string" ? values.note : "",
        photoUrl: typeof values.photoUrl === "string" && values.photoUrl ? values.photoUrl : null,
        ...(needsApproval(values) && approver && pin ? { approver: { userId: approver.id, pin } } : {}),
      },
    };
  },
  invalidate: [["retail-product"], ["list", "retail-stock-on-hand"], ["list", "retail-stock-movements"], ["nav-badges"], ["record-activity"]],
  requires: [["retail.adjustments", "create"]],
};

/* ── Break a case ───────────────────────────────────────────────────────── */

const casesOf = (values: SheetValues) => {
  const typed = typeof values.cases === "string" ? values.cases.trim() : "";
  return /^\d+$/.test(typed) ? Number(typed) : null;
};

/** The case's and its singles' on hand at the site, and its size. */
async function caseFacts(caseProductId: string, siteId: string | null): Promise<SheetValues> {
  const cases = await readLines({ productId: caseProductId, ...(siteId ? { siteId } : {}) });
  const line = cases.data[0] ?? null;
  const singleId = line?.product.packOf?.id ?? null;
  const singles = singleId ? await readLines({ productId: singleId, ...(siteId ? { siteId } : {}) }) : null;
  return {
    _caseOnHand: line?.onHand ?? 0,
    _packSize: line?.product.packSize ?? 0,
    _singleOnHand: singles?.data[0]?.onHand ?? 0,
  };
}

/** "Cases 4 → 3, singles 2 → 26". */
export function caseThen(values: SheetValues): string {
  const n = casesOf(values) ?? 0;
  const before = Number(values._caseOnHand ?? 0);
  const singles = Number(values._singleOnHand ?? 0);
  const size = Number(values._packSize ?? 0);
  return `Cases ${count(before)} → ${count(before - n)}, singles ${count(singles)} → ${count(singles + n * size)}`;
}

const caseBreak: SheetKind = {
  title: "Break a case",
  sub: (_ctx, values) => (values.caseProductId as PickedOption | null)?.label ?? "Pick a case",
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "caseProductId",
          t: "auto",
          l: "Case",
          noun: "pack",
          context: (_ctx, values) => (values._siteId ? { siteId: values._siteId } : {}),
          needed: "Pick a case.",
          follow: async (value, values) => {
            const picked = (value as PickedOption | null) ?? null;
            if (!picked) return null;
            return caseFacts(picked.id, (values._siteId as string | null) ?? null);
          },
        },
        { id: "cases", t: "text", l: "Cases", mono: true, right: true, half: true, v: "1", needed: "Say how many cases to open" },
        { id: "then", t: "read", l: "Then", half: true, derive: (values) => caseThen(values) },
      ],
    },
  ],
  note: "Tills do this on their own when singles run out, if Break cases at the till is on.",
  done: (_result, _values, payload) => (payload as { message?: string } | null)?.message ?? "Opened.",
  primary: (values) => {
    const n = casesOf(values) ?? 1;
    return `Break ${count(n)} ${n === 1 ? "case" : "cases"}`;
  },
  load: async (ctx) => {
    const productId = productOf(ctx);
    if (!productId) throw new Error("Open this from a product.");
    const answer = await readLines({ productId });
    const line = pickLine(answer.data, ctx.params.get("siteId"), answer.defaultSiteId);
    if (!line) return { caseProductId: null };
    const siteId = line.site.id;
    // The record itself when it is a case, else its first case.
    const pack = line.product.packOf
      ? { id: line.product.id, label: line.product.name }
      : line.cases[0]
        ? { id: line.cases[0].productId, label: line.cases[0].name }
        : null;
    if (!pack) return { _siteId: siteId, caseProductId: null };
    return { _siteId: siteId, caseProductId: { ...pack, sub: null }, ...(await caseFacts(pack.id, siteId)) };
  },
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/stock/case-breaks",
    body: {
      caseProductId: (values.caseProductId as PickedOption | null)?.id,
      siteId: (values._siteId as string | null) ?? null,
      cases: casesOf(values) ?? 0,
    },
  }),
  invalidate: [["retail-product"], ["list", "retail-stock-on-hand"], ["list", "retail-stock-movements"], ["nav-badges"], ["record-activity"]],
  requires: [["retail.adjustments", "create"]],
};

export const STOCK_ADJUST_SHEETS: Record<string, SheetKind> = {
  "stock-adjust": stockAdjust,
  "case-break": caseBreak,
};
