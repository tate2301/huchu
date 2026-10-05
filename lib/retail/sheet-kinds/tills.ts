import { z } from "zod";

import { unpairAsk } from "@/lib/retail/asks/tills";
import {
  DEVICE_CHOICES,
  codeShown,
  deviceChoiceKind,
  deviceChoiceWords,
  pairingPayload,
  sentWords,
  siteHint,
  unpairShiftOpen,
} from "@/lib/retail/till-words";
import type { DeviceSummary, TillDetail } from "@/lib/retail/tills";
import type { FieldSpec, PickedOption, SheetCtx, SheetKind, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Tills and devices' sheets (10-setup 5.5; W-04, W-76): Pair a till, a till,
 * Pair another device, and the list's Send a message. Each talks to
 * `/api/v2/retail/tills*`. A sheet that shows a pairing code polls the till
 * every 2 seconds while it is open, swaps in a new code when one runs out,
 * and flips to "Paired" when the device redeems it. Leaving it expires the
 * code (or removes the till Pair a till made); nothing is issued after that.
 */

const TILLS = "/retail/manage/tills";
const SUB = "Setup › Tills and devices";
const invalidateTills = [["list", "retail-tills"], ["list", "retail-sites"], ["lookup", "till"]];

type Answer = { ok: boolean; status: number; payload: Record<string, unknown> | null };

async function call(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<Answer> {
  const response = await fetch(url, {
    method,
    credentials: "include",
    signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, payload };
}

const failure = (answer: Answer) =>
  new Error(typeof answer.payload?.error === "string" ? answer.payload.error : "That could not be read. Close it and try again.");

const tillUrl = (id: string, rest = "") => `/api/v2/retail/tills/${encodeURIComponent(id)}${rest}`;

async function readTill(id: string): Promise<TillDetail> {
  const answer = await call(tillUrl(id));
  if (!answer.ok) throw failure(answer);
  return answer.payload!.data as TillDetail;
}

/**
 * Once per opening: React runs an effect twice in development, and opening
 * Pair a till must make one till and one code, not two. Keyed by the sheet's
 * context, which is one object for as long as the sheet is open.
 */
function oncePer<T>(make: (ctx: SheetCtx) => Promise<T>): (ctx: SheetCtx) => Promise<T> {
  const made = new WeakMap<SheetCtx, Promise<T>>();
  return (ctx) => {
    let promise = made.get(ctx);
    if (!promise) {
      promise = make(ctx);
      made.set(ctx, promise);
    }
    return promise;
  };
}

/** A code answer, or the plan's refusal in its place (409 PLAN_LIMIT). */
type Coded = { code: string } | { refused: string };

async function issueCode(id: string, purpose: "PAIR" | "REPLACE"): Promise<Coded> {
  const answer = await call(tillUrl(id, "/pairing-code"), "POST", { purpose });
  if (answer.ok) return { code: String(answer.payload!.code) };
  if (answer.status === 409 && answer.payload?.code === "PLAN_LIMIT") return { refused: String(answer.payload.error) };
  throw failure(answer);
}

function codeValues(coded: Coded): SheetValues {
  if ("refused" in coded) return { refused: coded.refused, _refused: true, _code: null };
  return { code: codeShown(coded.code), _code: coded.code, _state: "waiting", pairing: "Not paired yet", _refused: false };
}

const tillIdOf = (ctx: SheetCtx, values: SheetValues) => (values._id as string | undefined) ?? ctx.id;

/**
 * One poll: paired → the device it made; a code that ran out while the sheet
 * is still open → a fresh one (or the plan's refusal); waiting → nothing new.
 * Once the sheet is left (`left`), a code reads "expired" because Cancel
 * expired it, and it stays that way.
 */
export function pollPairing(purpose: "PAIR" | "REPLACE") {
  return async (ctx: SheetCtx, values: SheetValues, left: AbortSignal): Promise<SheetValues | null> => {
    const id = tillIdOf(ctx, values);
    if (left.aborted || !id || !values._code || values._state === "paired") return null;
    const answer = await call(tillUrl(id, "/pairing"), "GET", undefined, left);
    if (left.aborted || !answer.ok) return null;
    const state = answer.payload?.state;
    if (state === "paired") {
      const device = (answer.payload?.device ?? null) as DeviceSummary | null;
      return {
        _state: "paired",
        _paired: true,
        pairing: device?.label ?? "Paired",
        _pairedTo: device?.label ?? null,
        ...(device ? { last: device.lastSeen, paired: device.paired } : {}),
      };
    }
    if (state === "expired") return codeValues(await issueCode(id, purpose));
    return null;
  };
}

const pairedNow = (values: SheetValues) => values._state === "paired";

/** "Pairing code" with its QR for a Kora, then "Waiting for the till…" that flips to "Paired". */
function codeFields(input: { hint: string; waiting: string; kora: (values: SheetValues) => boolean; show?: (values: SheetValues) => boolean }): FieldSpec[] {
  const show = input.show ?? (() => true);
  return [
    {
      id: "code",
      t: "read",
      l: "Pairing code",
      mono: true,
      h: input.hint,
      qr: (values) => (input.kora(values) && typeof values._code === "string" ? pairingPayload(values._code) : null),
      // A used code is gone: once paired only "Paired" stays.
      show: (values) => show(values) && values._refused !== true && !pairedNow(values),
    },
    {
      id: "pairing",
      t: "read",
      l: input.waiting,
      lw: (values) => (pairedNow(values) ? "Paired" : input.waiting),
      tone: (values) => (pairedNow(values) ? "ok" : "warn"),
      show: (values) => show(values) && values._refused !== true,
    },
    // The plan's refusal in the code's place (W-04 step 1).
    {
      id: "refused",
      t: "read",
      l: "Pairing code",
      tone: "warn",
      show: (values) => show(values) && values._refused === true,
    },
  ];
}

const planLink = (values: SheetValues) =>
  values._refused === true ? { label: "Plan and billing", href: "/preferences/organization/billing" } : null;

const text = (value: unknown) => String(value ?? "").trim();
const pickedId = (value: unknown) => (value as PickedOption | null)?.id ?? null;
const siteCount = (values: SheetValues) => Number(values._siteCount ?? 1);
const siteOption = (site: { id: string; name: string }): PickedOption => ({ id: site.id, label: site.name });

/* ── Pair a till (`K.till`, board TillNew) ────────────────────────────────── */

const KORA = "Kora handheld";

/** Opening the sheet makes the till and its first code (W-04 step 1), once. */
const createTill = oncePer(async (ctx: SheetCtx): Promise<SheetValues> => {
  const siteId = ctx.params.get("site");
  const answer = await call("/api/v2/retail/tills", "POST", {
    ...(siteId ? { siteId } : {}),
    deviceKind: "COUNTER_MINI",
  });
  if (answer.status === 409 && answer.payload?.code === "PLAN_LIMIT") {
    return { ...codeValues({ refused: String(answer.payload.error) }), _siteCount: 1 };
  }
  if (!answer.ok) throw failure(answer);
  const till = answer.payload!.data as TillDetail;
  return {
    name: till.name,
    siteId: siteOption(till.site),
    kind: deviceChoiceWords(till.deviceKind),
    printer: till.hasPrinter,
    drawer: till.hasDrawer,
    scale: till.hasScale,
    _id: till.id,
    _siteCount: till.siteCount,
    ...codeValues({ code: String(answer.payload!.code) }),
  };
});

const tillNew: SheetKind = {
  title: "Pair a till",
  sub: SUB,
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "name", t: "text", l: "Name" },
        {
          id: "siteId",
          t: "auto",
          l: "Site",
          noun: "site",
          h: (values) => siteHint(siteCount(values)),
          show: (values) => siteCount(values) >= 2,
        },
        {
          id: "kind",
          t: "seg",
          l: "Device",
          v: DEVICE_CHOICES[0]![1],
          o: DEVICE_CHOICES.map(([, label]) => label),
          h: "All three run the same Tender. A browser is any laptop, PC or tablet on the shop’s POS address.",
        },
      ],
    },
    {
      title: "On the till",
      fields: codeFields({
        hint: "On the device, open Tender and type this code, or scan it. It works once, for 10 minutes. No password goes on the device.",
        waiting: "Waiting for the till…",
        kora: (values) => values.kind === KORA,
      }),
    },
    {
      title: "Plugged in",
      fields: [
        { id: "printer", t: "toggle", l: "Receipt printer", v: true, h: "Built in on CounterMini. In a browser, receipts go to its print dialog." },
        { id: "drawer", t: "toggle", l: "Cash drawer", v: true, h: "Opens on a cash sale." },
        { id: "scale", t: "toggle", l: "Scale", v: false },
      ],
    },
  ],
  note: (values) => (values._refused === true ? "" : "Then ring up a test sale and void it."),
  noteLink: planLink,
  primary: "Done",
  primaryDisabled: (values) => values._refused === true || !values._id,
  done: (_result, values) =>
    pairedNow(values)
      ? `${text(values.name)} paired. Ring up a test sale to check the printer.`
      : `${text(values.name)} saved.`,
  load: createTill,
  poll: { every: 2000, run: pollPairing("PAIR") },
  // Cancel removes the till it made, unless a device paired meanwhile.
  cancel: (_ctx, values) =>
    values._id && !pairedNow(values) ? { method: "DELETE", url: tillUrl(String(values._id)) } : null,
  submit: (values) => ({
    method: "PATCH",
    url: tillUrl(String(values._id)),
    body: {
      name: text(values.name),
      ...(pickedId(values.siteId) ? { siteId: pickedId(values.siteId) } : {}),
      deviceKind: deviceChoiceKind(values.kind),
      hasPrinter: values.printer === true,
      hasDrawer: values.drawer === true,
      hasScale: values.scale === true,
    },
  }),
  invalidate: invalidateTills,
  requires: [["retail.tills", "create"]],
};

/* ── A till (`K.tilledit`, board TillEdit) ────────────────────────────────── */

const MOVE_HINT = "Close the shift on it before moving it.";

/** The till as its sheet holds it; a till with no device gets a code to pair one (once). */
const loadTill = oncePer(async (ctx: SheetCtx): Promise<SheetValues> => {
  const till = await readTill(ctx.id ?? "");
  const ownList = till.priceLists.find((list) => list.id === till.priceListId)?.name ?? null;
  const values: SheetValues = {
    name: till.name,
    siteId: siteOption(till.site),
    list: ownList ?? till.sitePriceList ?? "",
    printer: till.hasPrinter,
    drawer: till.hasDrawer,
    last: till.current?.lastSeen ?? "",
    paired: till.current?.paired ?? "",
    _id: till.id,
    _name: till.name,
    _sub: till.sub,
    _paired: Boolean(till.current),
    _wasPaired: Boolean(till.current),
    _device: till.current?.label ?? null,
    _deviceKind: till.deviceKind,
    _openShift: till.openShift,
    _siteCount: till.siteCount,
    _lists: till.priceLists,
    _sitePriceList: till.sitePriceList,
  };
  if (till.current || !ctx.can("retail.tills", "update")) return values;
  return { ...values, ...codeValues(await issueCode(till.id, "PAIR")) };
});

type OpenShift = TillDetail["openShift"];
const openShiftOf = (values: SheetValues) => (values._openShift ?? null) as OpenShift;
const isPaired = (values: SheetValues) => values._paired === true;

function priceListIdOf(values: SheetValues): string | null {
  const lists = (values._lists ?? []) as TillDetail["priceLists"];
  // The site's own list is "the site's list": the till follows the site.
  if (values.list === values._sitePriceList) return null;
  return lists.find((list) => list.name === values.list)?.id ?? null;
}

const tillEdit: SheetKind = {
  title: (_ctx, values) => String(values._name ?? ""),
  sub: (_ctx, values) => String(values._sub ?? SUB),
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "name", t: "text", l: "Name" },
        {
          id: "siteId",
          t: "auto",
          l: "Site",
          noun: "site",
          show: (values) => siteCount(values) >= 2,
          disabled: (values) => openShiftOf(values) !== null,
          h: (values) => (openShiftOf(values) ? MOVE_HINT : ""),
        },
        {
          id: "list",
          t: "seg",
          l: "Sells from price list",
          o: (values) => ((values._lists ?? []) as TillDetail["priceLists"]).map((list) => list.name),
          show: (values) => ((values._lists ?? []) as unknown[]).length > 0,
        },
      ],
    },
    {
      title: "Device",
      fields: [
        { id: "printer", t: "toggle", l: "Receipt printer" },
        { id: "drawer", t: "toggle", l: "Cash drawer" },
        { id: "last", t: "read", l: "Last seen", show: isPaired },
        {
          id: "paired",
          t: "read",
          l: "Paired",
          h: "Pair another device swaps it: the old one stops the moment the new one pairs. Unpair needs the shift on it closed first.",
          show: isPaired,
        },
        // Not paired (inferred): the Pair a till code block.
        ...codeFields({
          hint: "On the device, open Tender and type this code, or scan it. It works once, for 10 minutes. No password goes on the device.",
          waiting: "Waiting for the till…",
          kora: (values) => values._deviceKind === "KORA",
          show: (values) => values._wasPaired !== true && values._code !== undefined,
        }),
      ],
    },
  ],
  note: "",
  noteLink: planLink,
  primary: "Save",
  done: (result) => `${(result as TillDetail).name} saved.`,
  danger: {
    label: "Unpair",
    show: (ctx, values) => ctx.can("retail.tills", "update") && values._wasPaired === true,
    // With a shift open the server would refuse: the dialog says why and offers only "Keep it".
    ask: (_ctx, values) => unpairAskOf(values),
    request: (ctx) => ({ method: "POST", url: tillUrl(ctx.id ?? "", "/unpair") }),
    done: (values) => `${String(values._name ?? "The till")} unpaired.`,
  },
  secondaryLink: (ctx, values) =>
    values._wasPaired === true && ctx.can("retail.tills", "update")
      ? { label: "Pair another device", href: `${TILLS}?sheet=till-replace&id=${encodeURIComponent(ctx.id ?? "")}` }
      : null,
  readOnly: (ctx) => !ctx.can("retail.tills", "update"),
  load: loadTill,
  poll: { every: 2000, run: pollPairing("PAIR") },
  cancel: (ctx, values) =>
    values._code && !pairedNow(values) ? { method: "DELETE", url: tillUrl(ctx.id ?? "", "/pairing-code") } : null,
  submit: (values, ctx): SheetRequest => ({
    method: "PATCH",
    url: tillUrl(ctx.id ?? ""),
    body: {
      name: text(values.name),
      ...(siteCount(values) >= 2 && pickedId(values.siteId) ? { siteId: pickedId(values.siteId) } : {}),
      ...(values._lists ? { priceListId: priceListIdOf(values) } : {}),
      hasPrinter: values.printer === true,
      hasDrawer: values.drawer === true,
    },
  }),
  invalidate: invalidateTills,
  requires: [["retail.tills", "view"]],
};

/* ── Pair another device (`K.tillreplace`, board TillReplace) ─────────────── */

const loadReplace = oncePer(async (ctx: SheetCtx): Promise<SheetValues> => {
  const till = await readTill(ctx.id ?? "");
  if (!till.current) throw new Error(`${till.name} has no device to swap. Pair a device to it instead.`);
  const shift = till.openShift;
  const seen = till.current.seen;
  return {
    old: `${till.current.label} · last seen ${seen.charAt(0).toLowerCase()}${seen.slice(1)}`,
    shift: shift ? `${shift.cashier}, since ${shift.since}` : "None",
    _id: till.id,
    _name: till.name,
    _device: till.current.label,
    _deviceKind: till.deviceKind,
    _openShift: shift,
    ...codeValues(await issueCode(till.id, "REPLACE")),
  };
});

const tillReplace: SheetKind = {
  title: (_ctx, values) => (values._name ? `Pair another device to ${String(values._name)}` : "Pair another device"),
  sub: (_ctx, values) => (values._name ? `${SUB} › ${String(values._name)}` : SUB),
  cur: "US$",
  sections: [
    {
      title: "On the new device",
      fields: codeFields({
        hint: "Open Tender on the new device and type this code, or scan it. It works once, for 10 minutes.",
        waiting: "Waiting for the device…",
        kora: (values) => values._deviceKind === "KORA",
      }),
    },
    {
      title: "The one it replaces",
      fields: [
        { id: "old", t: "read", l: "On the till now", lw: (values) => `On ${String(values._name ?? "the till")} now` },
        {
          id: "shift",
          t: "read",
          l: "Open shift",
          tone: (values) => (openShiftOf(values) ? "warn" : undefined),
          h: (values) =>
            openShiftOf(values)
              ? "Close it on the old device first. If that device is lost, close the shift from its own page and enter the count there."
              : "",
        },
      ],
    },
  ],
  note: "The old device signs out at its next request. Sales it holds offline still come in, flagged for you.",
  primary: "Done",
  done: (_result, values) =>
    pairedNow(values)
      ? `${String(values._name)} is on the new device.`
      : `${String(values._name)} stays on ${String(values._device)} until the new one pairs.`,
  load: loadReplace,
  poll: { every: 2000, run: pollPairing("REPLACE") },
  cancel: (ctx, values) =>
    values._code && !pairedNow(values) ? { method: "DELETE", url: tillUrl(ctx.id ?? "", "/pairing-code") } : null,
  // Nothing to save: the device pairs itself with the code.
  submit: () => null,
  invalidate: invalidateTills,
  requires: [["retail.tills", "update"]],
};

function unpairAskOf(values: SheetValues) {
  const name = String(values._name ?? "this till");
  const shift = openShiftOf(values);
  return unpairAsk(name, String(values._device ?? "Its device"), shift ? unpairShiftOpen(name, shift.cashier) : null);
}

/* ── Send a message (bulk, inferred, not drawn) ───────────────────────────── */

const tillIds = (ctx: SheetCtx) => {
  const ids = ctx.params.get("ids");
  if (ids) return ids.split(",").filter(Boolean);
  return ctx.id ? [ctx.id] : [];
};

const tillMessage: SheetKind = {
  title: "Send a message",
  sub: (ctx) => {
    const n = tillIds(ctx).length;
    return `${n} ${n === 1 ? "till" : "tills"}`;
  },
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "body",
          t: "area",
          l: "Message",
          rows: 4,
          h: "It shows on each till as a banner until someone there dismisses it.",
          schema: z.string().trim().max(280, "Keep the message to 280 characters."),
        },
      ],
    },
  ],
  note: "",
  primary: "Send",
  done: (result) => sentWords(Number((result as { sent?: number } | null)?.sent ?? 0)),
  submit: (values, ctx) => ({ method: "POST", url: "/api/v2/retail/tills/messages", body: { tillIds: tillIds(ctx), body: text(values.body) } }),
  invalidate: invalidateTills,
  requires: [["retail.tills", "update"]],
};

export const TILL_SHEETS: Record<string, SheetKind> = {
  "till-new": tillNew,
  till: tillEdit,
  "till-replace": tillReplace,
  "till-message": tillMessage,
};
