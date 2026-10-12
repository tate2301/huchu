import { fetchJson } from "@/lib/api-client";
import type { DrawerWords, LaybyForm, LaybyView } from "@/lib/retail/floor/laybys";
import {
  cancelLaybyAsk,
  cancelledWords,
  dueMovedWords,
  handedOverWords,
  paidWords,
  startedWords,
  usd,
} from "@/lib/retail/floor/layby-words";
import { addDays, todayIn } from "@/lib/workspace/format";
import type { PickedOption, SheetKind, SheetLine, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Lay-bys' sheets (FLR-06): `layby-new` puts goods aside for a customer with
 * a deposit (`LaybyNew.png`), `layby` takes a payment, moves the pay-by day,
 * hands it over or cancels it (`LaybyPay.png`). Money taken in cash goes into
 * one drawer: the sheet says which, or asks when several are open.
 */

const API = "/api/v2/retail/laybys";
const CASH = "Cash";

type Tender = { value: string; label: string };
type DrawerPick = { shiftId: string; label: string };

const LAYBY_INVALIDATE = [
  ["list", "retail-laybys"],
  ["list", "retail-sales"],
  ["list", "retail-stock-on-hand"],
  ["list", "retail-stock-movements"],
  ["list", "retail-shifts"],
  ["nav-badges"],
];

const amountOf = (text: unknown) => {
  const value = Number(String(text ?? "").replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : 0;
};
const cents = (value: number) => Math.round(value * 100) / 100;

const tendersOf = (values: SheetValues) => (values._tenders as Tender[] | undefined) ?? [];
const tenderValue = (values: SheetValues, field = "with") => tendersOf(values).find((tender) => tender.label === values[field])?.value ?? null;
const drawerChoices = (values: SheetValues) => (values._choose as DrawerPick[] | undefined) ?? [];
const pickedDrawer = (values: SheetValues) => drawerChoices(values).find((choice) => choice.label === values.drawer) ?? null;
/** What the drawer said when the sheet opened: its hint, or the drawers to choose from. */
function drawerValues(drawer: DrawerWords) {
  return {
    _drawerHint: drawer && "hint" in drawer ? drawer.hint : null,
    _choose: drawer && "choose" in drawer ? drawer.choose : [],
    drawer: drawer && "choose" in drawer ? (drawer.choose[0]?.label ?? "") : "",
  };
}
const refNeeded = (values: SheetValues, field: string) => values._refRequired === true && values[field] !== undefined && values[field] !== CASH;
/** Cash with no drawer open at the site, and none to choose from. */
const noDrawerOpen = (values: SheetValues, field: string) => values[field] === CASH && !values._drawerHint && drawerChoices(values).length === 0;

const onRefused = (payload: unknown) => {
  const answer = (payload as { choose?: DrawerPick[] } | null) ?? {};
  return answer.choose?.length ? { _choose: answer.choose, drawer: answer.choose[0]!.label } : null;
};

/* ── New lay-by ───────────────────────────────────────────────────────── */

const linesTotal = (values: SheetValues) =>
  cents(((values.lines as SheetLine[] | undefined) ?? []).reduce((sum, line) => sum + amountOf(line.quantity) * amountOf(line.cost), 0));
/** The smallest deposit for what is on the lines: the percent of their total, up to the cent. */
const leastDeposit = (values: SheetValues) => Math.ceil(cents(linesTotal(values) * Number(values._minPct ?? 20)) - 1e-6) / 100;

const laybyNew: SheetKind = {
  title: "New lay-by",
  sub: "The floor › Lay-bys",
  wide: true,
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "cust", t: "auto", l: "Customer", noun: "customer", h: "Needs a phone number for reminders.", needed: "Pick a customer." },
      ],
    },
    {
      title: "What is put aside",
      fields: [
        {
          id: "lines",
          t: "lines",
          l: "Put aside",
          nolabel: true,
          noun: "stock-line",
          context: (_ctx, values) => ({ for: "layby", siteId: values._siteId }),
          priced: true,
          ql: "How many",
          cl: "Price",
          h: "Put aside means off the shelf: it no longer shows as available.",
          needed: "Add the goods to put aside.",
        },
      ],
    },
    {
      title: "Paying",
      fields: [
        {
          id: "dep",
          t: "money",
          l: "Deposit today",
          half: true,
          h: (values) =>
            linesTotal(values) > 0 ? `At least ${String(values._minPct ?? 20)}%, ${usd(leastDeposit(values))}.` : `At least ${String(values._minPct ?? 20)}%.`,
          needed: "Type the deposit.",
        },
        {
          id: "due",
          t: "date",
          l: "Pay by",
          half: true,
          earliest: () => addDays(todayIn(), 1),
          latest: (values) => addDays(todayIn(), Number(values._maxDays ?? 90)),
          needed: "Pick the day they pay by.",
        },
        {
          id: "with",
          t: "seg",
          l: "With",
          half: true,
          o: (values) => tendersOf(values).map((tender) => tender.label),
          h: (values) =>
            values.with === CASH && drawerChoices(values).length === 0 ? String(values._drawerHint ?? values._noDrawer ?? "") : "",
        },
        {
          id: "drawer",
          t: "seg",
          l: "Drawer",
          half: true,
          o: (values) => drawerChoices(values).map((choice) => choice.label),
          show: (values) => values.with === CASH && drawerChoices(values).length > 0,
        },
        { id: "ref", t: "text", l: "Reference", half: true, p: "Slip or confirmation number", max: 60, show: (values) => refNeeded(values, "with") },
        { id: "remind", t: "toggle", l: "Remind on WhatsApp each week", v: true },
      ],
    },
  ],
  note: (values) => (noDrawerOpen(values, "with") ? String(values._noDrawer ?? "") : "Prices are held at today’s price until the due date."),
  primary: "Start the lay-by",
  primaryDisabled: (values) => noDrawerOpen(values, "with"),
  load: async () => {
    const form = (await fetchJson<{ data: LaybyForm }>(`${API}/new`)).data;
    return {
      _siteId: form.siteId,
      _minPct: form.minDepositPct,
      _maxDays: form.maxDays,
      _tenders: form.tenders,
      _refRequired: form.referenceRequired,
      _noDrawer: form.noDrawer,
      ...drawerValues(form.drawer),
      cust: null,
      lines: [],
      dep: "",
      due: form.defaultDue,
      with: form.tenders[0]?.label ?? CASH,
      ref: "",
      remind: true,
    };
  },
  onRefused,
  done: (result) => startedWords(result as { laybyNo: string; left: string; dueOn: string }),
  open: (result) => `/retail/laybys?sheet=layby&id=${(result as { id: string }).id}`,
  submit: (values) => {
    const tender = tenderValue(values);
    const drawer = pickedDrawer(values);
    return {
      method: "POST",
      url: API,
      body: {
        customerId: ((values.cust as PickedOption | null) ?? null)?.id ?? "",
        lines: ((values.lines as SheetLine[] | undefined) ?? []).map((line) => ({ productId: line.of ?? line.productId, quantity: String(line.quantity).trim() })),
        deposit: String(values.dep ?? "").trim(),
        depositTender: tender,
        ...(refNeeded(values, "with") ? { reference: String(values.ref ?? "").trim() } : {}),
        ...(tender === "CASH" && drawer ? { shiftId: drawer.shiftId } : {}),
        dueOn: String(values.due ?? ""),
        remindWeekly: values.remind === true,
      },
    };
  },
  invalidate: LAYBY_INVALIDATE,
  requires: [["retail.laybys", "create"]],
};

/* ── A lay-by: pay, move the date, hand over, cancel ──────────────────── */

const viewOf = (values: SheetValues) => (values._view as LaybyView | undefined) ?? null;
const paying = (values: SheetValues) => viewOf(values)?.status === "PAYING";
const ready = (values: SheetValues) => viewOf(values)?.status === "READY";
const dueChanged = (values: SheetValues) => paying(values) && Boolean(values.due) && values.due !== viewOf(values)?.dueOn;
const payingNow = (values: SheetValues) => cents(amountOf(values.amt));
const takesAll = (values: SheetValues) => {
  const left = Number(viewOf(values)?.left ?? 0);
  return left > 0 && payingNow(values) === cents(left);
};

/** How money moves now: the With picked while paying; a ready one's cancel goes back the way it was last paid. */
const moneyTender = (values: SheetValues) => (paying(values) ? tenderValue(values, "how") : (viewOf(values)?.lastTender ?? "CASH"));

/** The money's way and drawer, as the server takes them. */
function moneyBody(values: SheetValues) {
  const tender = tenderValue(values, "how");
  const drawer = pickedDrawer(values);
  return {
    tender,
    ...(refNeeded(values, "how") ? { reference: String(values.ref ?? "").trim() } : {}),
    ...(tender === "CASH" && drawer ? { shiftId: drawer.shiftId } : {}),
  };
}

const layby: SheetKind = {
  title: (_ctx, values) => viewOf(values)?.laybyNo ?? "Lay-by",
  sub: (_ctx, values) => {
    const view = viewOf(values);
    return view ? `${view.customer.name} · ${view.what}` : "";
  },
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "paidSoFar", t: "read", l: "Paid so far", half: true, mono: true },
        { id: "leftNow", t: "read", l: "Left", half: true, mono: true, right: true },
        { id: "amt", t: "money", l: "Paying now", half: true, opt: true, optQuiet: true, show: (values) => paying(values) },
        {
          id: "how",
          t: "seg",
          l: "With",
          half: true,
          o: (values) => tendersOf(values).map((tender) => tender.label),
          h: (values) => (values.how === CASH && drawerChoices(values).length === 0 ? String(values._drawerHint ?? values._noDrawer ?? "") : ""),
          show: (values) => paying(values),
        },
        {
          id: "drawer",
          t: "seg",
          l: "Drawer",
          o: (values) => drawerChoices(values).map((choice) => choice.label),
          // Cash in while paying; cash back on a ready one's cancel.
          show: (values) => moneyTender(values) === "CASH" && drawerChoices(values).length > 0 && Boolean(viewOf(values)?.can.changeDate),
        },
        { id: "ref", t: "text", l: "Reference", half: true, p: "Slip or confirmation number", max: 60, show: (values) => paying(values) && refNeeded(values, "how") },
        {
          id: "due",
          t: "date",
          l: "Pay by",
          h: "Extend it here if they ask.",
          earliest: () => addDays(todayIn(), 1),
          latest: (values) => addDays(todayIn(), Number(viewOf(values)?.maxDays ?? 90)),
          show: (values) => paying(values),
        },
        { id: "dueRead", t: "read", l: "Pay by", show: (values) => !paying(values) },
        {
          id: "payments",
          t: "read",
          l: "Payments",
          table: (values) => {
            const view = viewOf(values);
            if (!view) return null;
            return {
              head: ["When", "How", "Amount", "By"],
              rows: view.payments.map((payment) => [payment.at, `${payment.tender}, ${payment.kind.toLowerCase()}`, usd(payment.amount), payment.by]),
              end: [2],
              widths: ["24%", "28%", "20%", "28%"],
            };
          },
        },
      ],
    },
  ],
  note: (values) => (viewOf(values)?.can.cancel ? "Cancelling refunds what was paid, less any fee in Till rules, and puts the goods back." : ""),
  primary: (values) => {
    if (ready(values)) return "Hand it over";
    if (payingNow(values) > 0) return `Take ${usd(payingNow(values))}`;
    if (dueChanged(values)) return "Save the date";
    return "Take a payment";
  },
  primaryDisabled: (values) => paying(values) && payingNow(values) <= 0 && !dueChanged(values),
  readOnly: (ctx, values) => {
    const view = viewOf(values);
    return !ctx.can("retail.laybys", "update") || !view || view.status === "COLLECTED" || view.status === "CANCELLED";
  },
  secondaryAction: (ctx, values) => {
    if (!paying(values) || !viewOf(values)?.can.handOver) return null;
    return {
      label: "Hand it over",
      disabled: !takesAll(values),
      closes: true,
      request: { method: "POST", url: `${API}/${ctx.id}/hand-over`, body: { amount: String(values.amt ?? "").trim(), ...moneyBody(values) } },
      done: (payload) => handedOverWords((payload as { data: { laybyNo: string; saleNo: string } }).data),
    };
  },
  danger: {
    label: "Cancel the lay-by",
    show: (ctx, values) => ctx.can("retail.laybys", "delete") && Boolean(viewOf(values)?.can.cancel),
    ask: (_ctx, values) => {
      const view = viewOf(values)!;
      const tender = moneyTender(values);
      const by = tendersOf(values).find((entry) => entry.value === tender)?.label ?? CASH;
      return cancelLaybyAsk({
        laybyNo: view.laybyNo,
        customer: view.customer.name,
        paid: view.paid,
        paidBack: view.cancel.paidBack,
        fee: view.cancel.fee,
        by,
        what: view.what,
        many: view.lines.length > 1 || view.lines.some((line) => line.quantity > 1),
      });
    },
    request: (ctx, values) => {
      const drawer = pickedDrawer(values);
      const tender = moneyTender(values) ?? "CASH";
      return { method: "POST", url: `${API}/${ctx.id}/cancel`, body: { tender, ...(tender === "CASH" && drawer ? { shiftId: drawer.shiftId } : {}) } };
    },
    done: (_values, result) => cancelledWords((result as { data: { laybyNo: string; paidBack: string; fee: string } }).data),
  },
  load: async (ctx) => {
    if (!ctx.id) throw new Error("Open this from Lay-bys.");
    const view = (await fetchJson<{ data: LaybyView }>(`${API}/${ctx.id}`)).data;
    const how = view.tenders.find((tender) => tender.value === view.lastTender)?.label ?? view.tenders[0]?.label ?? CASH;
    return {
      _view: view,
      _tenders: view.tenders,
      _refRequired: view.referenceRequired,
      _noDrawer: view.noDrawer,
      ...drawerValues(view.drawer),
      paidSoFar: `${usd(view.paid)} of ${usd(view.total)}`,
      leftNow: usd(view.left),
      amt: "",
      how,
      ref: "",
      due: view.dueOn,
      dueRead: view.status === "READY" ? "Any time" : view.status === "COLLECTED" ? `Handed over${view.saleNo ? ` as ${view.saleNo}` : ""}` : "Cancelled",
      payments: "",
    };
  },
  onRefused,
  done: (result) => {
    const answer = result as { laybyNo: string; saleNo?: string; amount?: string; left?: string; status?: string; dueOn?: string };
    if (answer.saleNo) return handedOverWords({ laybyNo: answer.laybyNo, saleNo: answer.saleNo });
    if (answer.amount !== undefined) return paidWords({ laybyNo: answer.laybyNo, amount: answer.amount, left: answer.left ?? "0", status: answer.status ?? "PAYING" });
    return dueMovedWords(answer.dueOn ?? "");
  },
  submit: (values, ctx) => {
    if (ready(values)) return { method: "POST", url: `${API}/${ctx.id}/hand-over`, body: {} };
    if (payingNow(values) > 0) {
      return {
        method: "POST",
        url: `${API}/${ctx.id}/payments`,
        body: { amount: String(values.amt ?? "").trim(), ...moneyBody(values), ...(dueChanged(values) ? { dueOn: String(values.due) } : {}) },
      };
    }
    return { method: "PATCH", url: `${API}/${ctx.id}`, body: { dueOn: String(values.due ?? "") } };
  },
  invalidate: LAYBY_INVALIDATE,
  requires: [["retail.laybys", "view"]],
};

export const LAYBY_SHEETS: Record<string, SheetKind> = {
  "layby-new": laybyNew,
  layby,
};
