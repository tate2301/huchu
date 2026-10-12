import { voidVoucherAsk } from "@/lib/retail/asks/products";
import { addMonths } from "@/lib/retail/vouchers/dates";
import type { VoucherView } from "@/lib/retail/vouchers/service";
import { ANYONE, FORM_KINDS, SEND_BY_WORDS } from "@/lib/retail/vouchers/words";
import { formatCount, formatDay, formatMoney, todayIn } from "@/lib/workspace/format";
import type { PickedOption, SheetCtx, SheetKind, SheetValues } from "@/lib/workspace/sheet-kind";

import { readJson } from "./products";

/**
 * Vouchers' sheets (PRD-10, W-18, `VoucherNew.png`, `VoucherEdit.png`): Issue
 * vouchers (`voucher-new`), a voucher's expiry and holder with Resend and
 * Void it (`voucher-edit`), and Extend for one or many (`voucher-extend`).
 * "For" is the `customer` autocomplete (CUS-02), with its inline add.
 */

const invalidateVouchers = [["list", "retail-vouchers"], ["retail-voucher"], ["list", "retail-voucher-uses"], ["reports"]];

const KIND_LABELS = FORM_KINDS.map((entry) => entry.label);
const SEND_LABELS = (["PRINT", "WHATSAPP", "BOTH"] as const).map((key) => SEND_BY_WORDS[key]);
const kindOf = (values: SheetValues) => FORM_KINDS.find((entry) => entry.label === values.kind)?.kind ?? "GIFT";
const sendOf = (values: SheetValues) => (["PRINT", "WHATSAPP", "BOTH"] as const).find((key) => SEND_BY_WORDS[key] === values.send) ?? "PRINT";
const pickedOf = (values: SheetValues) => (values.customer as PickedOption | null | undefined) ?? null;
const holderOf = (values: SheetValues) => pickedOf(values)?.label ?? "";

/** A year from today in the shop's zone: "3 October 2027". */
const aYearOn = () => formatDay(addMonths(todayIn(), 12));

const voucherUrl = (id: string) => `/api/v2/retail/vouchers/${encodeURIComponent(id)}`;

const message = (fallback: string) => (_result: unknown, _values: SheetValues, payload: unknown) =>
  String((payload as { message?: string } | null)?.message ?? fallback);

const voucherNew: SheetKind = {
  title: "Issue vouchers",
  sub: "Products › Vouchers",
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "kind", t: "seg", l: "Kind", o: KIND_LABELS, v: KIND_LABELS[0] },
        { id: "value", t: "money", l: "Value", half: true, v: "50.00", show: (values) => kindOf(values) !== "DISCOUNT", needed: "Write what it is worth." },
        {
          id: "off",
          t: "text",
          l: "Value",
          half: true,
          mono: true,
          p: "10% or 5.00",
          show: (values) => kindOf(values) === "DISCOUNT",
          needed: "Write 10% or an amount off, like 5.00.",
        },
        { id: "howMany", t: "text", l: "How many", half: true, mono: true, right: true, max: 3, v: "1", needed: "Write how many, like 1." },
        { id: "customer", t: "auto", l: "For", noun: "customer", opt: true, h: "Leave empty for a voucher anyone can use." },
        { id: "expires", t: "text", l: "Expires", half: true, v: aYearOn, needed: "Write when it expires, like 3 October 2027." },
        { id: "minSale", t: "money", l: "Smallest sale it works on", half: true, opt: true, p: "0.00" },
        {
          id: "send",
          t: "seg",
          l: "Send by",
          o: SEND_LABELS,
          v: SEND_LABELS[0],
          // WhatsApp needs someone to send it to.
          disabled: (values) => holderOf(values) === "",
        },
      ],
    },
  ],
  note: "Paid gift vouchers are held as money owed until they are spent.",
  primary: "Issue",
  done: message("The vouchers are issued."),
  newTab: {
    when: (values) => sendOf(values) !== "WHATSAPP" || holderOf(values) === "",
    href: (result) => (result as { printUrl?: string | null } | null)?.printUrl ?? null,
  },
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/vouchers",
    body: {
      kind: kindOf(values),
      value: String((kindOf(values) === "DISCOUNT" ? values.off : values.value) ?? "").trim(),
      howMany: String(values.howMany ?? "").trim(),
      customerId: pickedOf(values)?.id ?? null,
      expires: String(values.expires ?? "").trim(),
      minSale: String(values.minSale ?? "").trim() || null,
      sendBy: holderOf(values) === "" ? "PRINT" : sendOf(values),
    },
  }),
  invalidate: invalidateVouchers,
  requires: [["retail.promotions", "create"]],
};

const voucherEdit: SheetKind = {
  title: (_ctx, values) => String(values._code ?? "A voucher"),
  sub: (_ctx, values) =>
    values._code === undefined ? "Products › Vouchers" : `${String(values._kindLabel)} · ${String(values._holder)} · ${String(values._leftLabel)} left`,
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "left", t: "read", l: "Left on it", half: true, mono: true, right: true },
        { id: "expiresOn", t: "text", l: "Expires", half: true, needed: "Write when it expires, like 28 September 2027." },
        { id: "customer", t: "auto", l: "For", noun: "customer", opt: true, optQuiet: true, p: ANYONE },
        { id: "used", t: "read", l: "Used" },
      ],
    },
  ],
  note: "Voiding needs a reason and shows in Activity.",
  primary: "Save",
  done: (_result, values) => `${String(values._code)} saved.`,
  readOnly: (ctx, values) => !ctx.can("retail.promotions", "update") || values._open === false,
  danger: {
    label: "Void it",
    show: (ctx, values) => ctx.can("retail.promotions", "delete") && values._open === true,
    ask: (_ctx, values) => voidVoucherAsk({ code: String(values._code ?? ""), count: 1, left: values._money === true ? String(values._leftLabel) : null }),
    request: (ctx) => ({ method: "POST", url: "/api/v2/retail/vouchers/void", body: { ids: [ctx.id ?? ""] } }),
    done: (values) => `${String(values._code)} is void.`,
  },
  secondaryAction: (ctx, values) =>
    values._code === undefined
      ? null
      : {
          label: "Resend",
          request: { method: "POST", url: `${voucherUrl(ctx.id ?? "")}/send` },
          done: (payload) => String((payload as { message?: string } | null)?.message ?? `${String(values._code)} sent on WhatsApp.`),
          disabled: values._canSend !== true,
        },
  load: async (ctx: SheetCtx) => {
    const view = await readJson<VoucherView>(voucherUrl(ctx.id ?? ""));
    return {
      left: view.left !== null && view.value !== null ? `${formatMoney(view.left)} of ${formatMoney(view.value)}` : `${view.leftLabel} of ${formatCount(view.copies)}`,
      expiresOn: formatDay(view.expiresOn),
      customer: view.customer ? { id: view.customer.id, label: view.customer.name, sub: view.customer.phone } : null,
      used:
        view.uses === 0
          ? "Not yet"
          : `${formatCount(view.uses)} ${view.uses === 1 ? "time" : "times"}${view.lastUsedAt ? `, last on ${formatDay(view.lastUsedAt)}` : ""}`,
      _code: view.code,
      _kindLabel: view.kindLabel,
      _holder: view.holderName ?? ANYONE,
      _leftLabel: view.leftLabel,
      _money: view.left !== null,
      _canSend: view.canSend,
      _open: !view.voidedAt && !view.expiredAt,
    };
  },
  submit: (values, ctx) => ({
    method: "PATCH",
    url: voucherUrl(ctx.id ?? ""),
    body: { expiresOn: String(values.expiresOn ?? "").trim(), customerId: pickedOf(values)?.id ?? null },
  }),
  invalidate: invalidateVouchers,
  requires: [["retail.promotions", "view"]],
};

const idsOf = (ctx: SheetCtx) => (ctx.id ? [ctx.id] : (ctx.params.get("ids") ?? "").split(",").filter(Boolean));

const voucherExtend: SheetKind = {
  title: (ctx) => {
    const count = idsOf(ctx).length;
    return count === 1 ? "Extend 1 voucher" : `Extend ${formatCount(count)} vouchers`;
  },
  sub: "Products › Vouchers",
  cur: "US$",
  sections: [{ fields: [{ id: "expiresOn", t: "text", l: "Expires", v: aYearOn, needed: "Write when they expire, like 3 October 2027." }] }],
  note: "Voided and expired vouchers keep their dates.",
  primary: "Extend",
  done: message("Extended."),
  submit: (values, ctx) => ({ method: "POST", url: "/api/v2/retail/vouchers/extend", body: { ids: idsOf(ctx), expiresOn: String(values.expiresOn ?? "").trim() } }),
  invalidate: invalidateVouchers,
  requires: [["retail.promotions", "update"]],
};

export const VOUCHER_SHEETS: Record<string, SheetKind> = {
  "voucher-new": voucherNew,
  "voucher-edit": voucherEdit,
  "voucher-extend": voucherExtend,
};
