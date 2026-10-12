import type { Prisma, RetailVoucherFunding, RetailVoucherKind, RetailVoucherSendBy } from "@prisma/client";
import { z } from "zod";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { paidWithLabel } from "@/lib/retail/words";
import { addDays, formatDay, formatMediumDay, formatMoney } from "@/lib/workspace/format";

import { addMonths, dateOf, daysUntil, voucherToday } from "./dates";
import { expiryDay, queueVoucherMessages, resolveHolder, sendRefusal, VoucherRefusal, type Issued } from "./issue";
import { VOIDED } from "./redeem";
import {
  dateKeyOf,
  holderWords,
  isMoneyKind,
  KIND_WORDS,
  leftWords,
  STATE_WORDS,
  valueWords,
  voucherState,
  type VoucherFacts,
  type VoucherState,
} from "./words";

/**
 * A voucher read and changed (W-18, PRD-10, 20-products §4.10): its view for
 * the record and the edit sheet, the list's rows, its uses, its months, and
 * the changes Owner and Manager make (expiry, holder, site), Extend for many
 * and Resend.
 */

const voucherSelect = {
  id: true,
  code: true,
  secret: true,
  kind: true,
  funding: true,
  value: true,
  balance: true,
  percentOff: true,
  amountOff: true,
  copies: true,
  usesLeft: true,
  minSale: true,
  expiresOn: true,
  issuedAt: true,
  expiredAt: true,
  voidedAt: true,
  voidReason: true,
  sendBy: true,
  sentAt: true,
  holderNote: true,
  customer: { select: { id: true, name: true, phone: true } },
  site: { select: { id: true, name: true } },
  issuedBy: { select: { name: true } },
  soldSale: {
    select: { id: true, saleNo: true, saleType: true, cashierName: true, payments: { select: { tenderType: true, currency: true } } },
  },
} satisfies Prisma.RetailVoucherSelect;

type VoucherRow = Prisma.RetailVoucherGetPayload<{ select: typeof voucherSelect }>;

const num = (value: Prisma.Decimal | null) => (value === null ? null : toNumberOrZero(value));
const round2 = (value: number) => Math.round(value * 100) / 100;

function factsOf(row: VoucherRow): VoucherFacts {
  return {
    kind: row.kind,
    value: num(row.value),
    balance: toNumberOrZero(row.balance),
    percentOff: num(row.percentOff),
    amountOff: num(row.amountOff),
    copies: row.copies,
    usesLeft: row.usesLeft,
    expiresOn: dateKeyOf(row.expiresOn),
    voidedAt: row.voidedAt,
    expiredAt: row.expiredAt,
  };
}

const holderName = (row: Pick<VoucherRow, "customer" | "holderNote">) => row.customer?.name ?? row.holderNote ?? null;

export type VoucherView = {
  id: string;
  code: string;
  /** Owner and Manager only. */
  secret?: string;
  kind: RetailVoucherKind;
  kindLabel: string;
  funding: RetailVoucherFunding;
  /** "Tapiwa Marange", "Anyone holding it", "Delta reps, 20 printed". */
  holder: string;
  /** Who it is for, with no copies after it; null for anyone holding it. */
  holderName: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  value: number | null;
  valueLabel: string;
  left: number | null;
  leftLabel: string;
  /** Money taken off it (net of refunds put back), or the discount it gave. */
  spent: number;
  uses: number;
  lastUsedAt: string | null;
  leftPercent: number | null;
  percentOff: number | null;
  amountOff: number | null;
  copies: number;
  usesLeft: number | null;
  minSale: number | null;
  issuedAt: string;
  expiresOn: string;
  daysToExpiry: number;
  site: string;
  siteId: string | null;
  state: VoucherState;
  stateLabel: string;
  soldSale: { id: string; saleNo: string; paidWith: string; cashier: string | null } | null;
  issuedBy: string | null;
  sendBy: RetailVoucherSendBy;
  /** It has a holder with a WhatsApp number to send it to. */
  canSend: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  expiredAt: string | null;
  tabCounts: { uses: number; activity: number };
};

type UseFigures = { spent: number; uses: number; lastUsedAt: Date | null };

async function figuresOfUses(ids: string[]): Promise<Map<string, UseFigures>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.retailVoucherUse.groupBy({
    by: ["voucherId"],
    where: { voucherId: { in: ids } },
    _sum: { amount: true },
    _max: { createdAt: true },
  });
  const counts = await prisma.retailVoucherUse.groupBy({
    by: ["voucherId"],
    where: { voucherId: { in: ids }, amount: { gt: 0 } },
    _count: { _all: true },
  });
  const countOf = new Map(counts.map((row) => [row.voucherId, row._count._all]));
  return new Map(
    rows.map((row) => [
      row.voucherId,
      { spent: round2(toNumberOrZero(row._sum.amount ?? 0)), uses: countOf.get(row.voucherId) ?? 0, lastUsedAt: row._max.createdAt },
    ]),
  );
}

function viewOf(row: VoucherRow, figures: UseFigures, today: string, activity: number, withSecret: boolean): VoucherView {
  const facts = factsOf(row);
  const money = isMoneyKind(row.kind);
  const state = voucherState(facts, today, figures.uses);
  const name = holderName(row);
  const value = facts.value;
  const left = money ? facts.balance : null;
  const sale = row.soldSale;
  return {
    id: row.id,
    code: row.code,
    ...(withSecret ? { secret: row.secret } : {}),
    kind: row.kind,
    kindLabel: KIND_WORDS[row.kind],
    funding: row.funding,
    holder: holderWords(name, facts),
    holderName: name,
    customer: row.customer,
    value,
    valueLabel: valueWords(facts),
    left,
    leftLabel: leftWords(facts),
    spent: figures.spent,
    uses: figures.uses,
    lastUsedAt: figures.lastUsedAt?.toISOString() ?? null,
    leftPercent: money && value ? Math.round(((left ?? 0) / value) * 100) : null,
    percentOff: facts.percentOff,
    amountOff: facts.amountOff,
    copies: row.copies,
    usesLeft: row.usesLeft,
    minSale: num(row.minSale),
    issuedAt: row.issuedAt.toISOString(),
    expiresOn: facts.expiresOn,
    daysToExpiry: daysUntil(today, facts.expiresOn),
    site: row.site?.name ?? "All sites",
    siteId: row.site?.id ?? null,
    state,
    stateLabel: STATE_WORDS[state],
    soldSale: sale ? { id: sale.id, saleNo: sale.saleNo, paidWith: paidWithLabel(sale.payments), cashier: sale.cashierName } : null,
    issuedBy: row.issuedBy?.name ?? null,
    sendBy: row.sendBy,
    canSend: Boolean(row.customer?.phone),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    expiredAt: row.expiredAt?.toISOString() ?? null,
    tabCounts: { uses: figures.uses, activity },
  };
}

const NO_USES: UseFigures = { spent: 0, uses: 0, lastUsedAt: null };

/** `GET /vouchers/[id]`: the secret only when `withSecret` (Owner and Manager). */
export async function loadVoucherView(companyId: string, id: string, withSecret: boolean, now: Date = new Date()): Promise<VoucherView | null> {
  const row = await prisma.retailVoucher.findFirst({ where: { id, companyId }, select: voucherSelect });
  if (!row) return null;
  const [figures, activity] = await Promise.all([
    figuresOfUses([id]),
    prisma.platformAuditEvent.count({ where: { companyId, entityType: "RetailVoucher", entityId: id } }),
  ]);
  return viewOf(row, figures.get(id) ?? NO_USES, voucherToday(now), activity, withSecret);
}

/** Every voucher of the shop, for the list (a shop keeps a few hundred at most). */
export async function loadVoucherViews(companyId: string, now: Date = new Date()): Promise<VoucherView[]> {
  const rows = await prisma.retailVoucher.findMany({ where: { companyId }, select: voucherSelect, orderBy: { code: "asc" } });
  const figures = await figuresOfUses(rows.map((row) => row.id));
  const today = voucherToday(now);
  return rows.map((row) => viewOf(row, figures.get(row.id) ?? NO_USES, today, 0, false));
}

/* ── Its uses and its months ──────────────────────────────────────────── */

export type VoucherUseRow = { id: string; saleId: string; saleNo: string; at: string; till: string; spent: number; leftAfter: number | null };

export async function voucherUseRows(companyId: string, voucherId: string): Promise<VoucherUseRow[]> {
  const uses = await prisma.retailVoucherUse.findMany({
    where: { companyId, voucherId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amount: true,
      balanceAfter: true,
      createdAt: true,
      voucher: { select: { kind: true } },
      sale: { select: { id: true, saleNo: true, register: { select: { name: true } } } },
    },
  });
  return uses.map((use) => ({
    id: use.id,
    saleId: use.sale.id,
    saleNo: use.sale.saleNo,
    at: use.createdAt.toISOString(),
    till: use.sale.register?.name ?? "Back office",
    spent: toNumberOrZero(use.amount),
    leftAfter: isMoneyKind(use.voucher.kind) ? toNumberOrZero(use.balanceAfter) : null,
  }));
}

/** "Spent from it, by month": each month from the first it could be spent in, over the range. */
export async function voucherChart(
  companyId: string,
  id: string,
  range: "3m" | "12m" | "all",
  now: Date = new Date(),
): Promise<{ months: Array<{ start: string; spent: number }> } | null> {
  const voucher = await prisma.retailVoucher.findFirst({ where: { id, companyId }, select: { issuedAt: true } });
  if (!voucher) return null;
  const today = voucherToday(now);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const issuedMonth = `${voucherToday(voucher.issuedAt).slice(0, 7)}-01`;
  const back = range === "3m" ? 2 : range === "12m" ? 11 : null;
  const rangeStart = back === null ? issuedMonth : addMonths(thisMonth, -back);
  const first = issuedMonth > rangeStart ? issuedMonth : rangeStart;
  const uses = await prisma.retailVoucherUse.findMany({
    where: { companyId, voucherId: id, createdAt: { gte: dateOf(addDays(first, -1)) } },
    select: { amount: true, createdAt: true },
  });
  const months: Array<{ start: string; spent: number }> = [];
  for (let month = first; month <= thisMonth; month = addMonths(month, 1)) months.push({ start: month, spent: 0 });
  for (const use of uses) {
    const key = `${voucherToday(use.createdAt).slice(0, 7)}-01`;
    const bucket = months.find((entry) => entry.start === key);
    if (bucket) bucket.spent = round2(bucket.spent + toNumberOrZero(use.amount));
  }
  return { months };
}

/* ── Changing one ─────────────────────────────────────────────────────── */

export const voucherPatch = z
  .object({
    expiresOn: z.string().max(60).optional(),
    customerId: z.string().uuid("Pick one of this shop's customers.").optional().nullable(),
    /** "For" as typed while the customer lookup is not in yet; empty clears it to anyone holding it. */
    holder: z.string().trim().max(120, "Keep it to 120 characters.").optional().nullable(),
    siteId: z.string().uuid("Pick one of this shop's sites.").optional().nullable(),
  })
  .strict();
export type VoucherPatch = z.infer<typeof voucherPatch>;

/** It can still change: not voided, not lapsed and written off by the worker. */
function stillOpen(row: { voidedAt: Date | null; expiredAt: Date | null; expiresOn: Date }) {
  if (row.voidedAt) throw new VoucherRefusal(409, VOIDED);
  if (row.expiredAt) throw new VoucherRefusal(409, `It expired on ${formatMediumDay(dateKeyOf(row.expiresOn))} and was written off.`);
}

/** `PATCH /vouchers/[id]` (promotions:update): its expiry, who it is for, its site. */
export async function updateVoucher(actor: RetailAuditActor, id: string, patch: VoucherPatch, now: Date = new Date()): Promise<{ changed: number; message: string }> {
  const { companyId } = actor;
  const today = voucherToday(now);
  return prisma.$transaction(async (tx) => {
    const row = await tx.retailVoucher.findFirst({
      where: { id, companyId },
      select: { code: true, expiresOn: true, voidedAt: true, expiredAt: true, customerId: true, holderNote: true, siteId: true, customer: { select: { name: true } }, site: { select: { name: true } } },
    });
    if (!row) throw new VoucherRefusal(404, "Voucher not found");
    stillOpen(row);
    const data: Prisma.RetailVoucherUncheckedUpdateInput = {};
    const changes: Array<{ label: string; from: string | null; to: string | null }> = [];
    if (patch.expiresOn !== undefined) {
      const day = expiryDay(patch.expiresOn, today, "expiresOn");
      const was = dateKeyOf(row.expiresOn);
      if (day !== was) {
        data.expiresOn = dateOf(day);
        changes.push({ label: "Expires", from: formatMediumDay(was), to: formatMediumDay(day) });
      }
    }
    if (patch.customerId !== undefined || patch.holder !== undefined) {
      const holder = await resolveHolder(tx, companyId, { customerId: patch.customerId, holder: patch.holder });
      const was = row.customer?.name ?? row.holderNote ?? null;
      const becomes = holder.customer?.name ?? holder.note ?? null;
      if ((holder.customer?.id ?? null) !== row.customerId || holder.note !== row.holderNote) {
        data.customerId = holder.customer?.id ?? null;
        data.holderNote = holder.note;
        changes.push({ label: "For", from: was ?? "Anyone holding it", to: becomes ?? "Anyone holding it" });
      }
    }
    if (patch.siteId !== undefined) {
      const site = patch.siteId ? await tx.site.findFirst({ where: { id: patch.siteId, companyId, isActive: true }, select: { id: true, name: true } }) : null;
      if (patch.siteId && !site) throw new VoucherRefusal(400, "Pick one of this shop's sites.", { siteId: "Pick one of this shop's sites." });
      if ((site?.id ?? null) !== row.siteId) {
        data.siteId = site?.id ?? null;
        changes.push({ label: "Sites", from: row.site?.name ?? "All sites", to: site?.name ?? "All sites" });
      }
    }
    if (changes.length === 0) return { changed: 0, message: `${row.code} saved.` };
    await tx.retailVoucher.update({ where: { id }, data });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.voucherChanged,
      entityType: "RetailVoucher",
      entityId: id,
      payload: { code: row.code, changes },
    });
    return { changed: changes.length, message: `${row.code} saved.` };
  });
}

export const extendInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "Tick at least one.").max(200),
  expiresOn: z.string().max(60),
});

/** `POST /vouchers/extend` (promotions:update): one new expiry for each voucher still open. */
export async function extendVouchers(actor: RetailAuditActor, input: z.infer<typeof extendInput>, now: Date = new Date()): Promise<{ changed: number; message: string }> {
  const day = expiryDay(input.expiresOn, voucherToday(now), "expiresOn");
  let changed = 0;
  for (const id of [...new Set(input.ids)]) {
    const row = await prisma.retailVoucher.findFirst({ where: { id, companyId: actor.companyId }, select: { voidedAt: true, expiredAt: true } });
    if (!row || row.voidedAt || row.expiredAt) continue;
    changed += (await updateVoucher(actor, id, { expiresOn: day }, now)).changed;
  }
  return { changed, message: `Extended to ${formatDay(day)}.` };
}

/** `POST /vouchers/[id]/send` (promotions:update): sent again on WhatsApp to its holder. */
export async function sendVoucher(actor: RetailAuditActor, id: string, now: Date = new Date()): Promise<{ sent: true; message: string }> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const row = await tx.retailVoucher.findFirst({ where: { id, companyId }, select: voucherSelect });
    if (!row) throw new VoucherRefusal(404, "Voucher not found");
    stillOpen(row);
    const refusal = sendRefusal({ customer: row.customer, note: row.holderNote });
    if (refusal) throw new VoucherRefusal(400, refusal);
    const issued: Issued = {
      id: row.id,
      code: row.code,
      secret: row.secret,
      kind: row.kind,
      valueLabel: valueWords(factsOf(row)),
      expiresOn: dateKeyOf(row.expiresOn),
    };
    await queueVoucherMessages(tx, { companyId, to: row.customer!.phone!, vouchers: [issued], createdById: actor.userId });
    await tx.retailVoucher.update({ where: { id }, data: { sentAt: now } });
    await writeRetailAuditEvent(tx, { actor, eventType: RETAIL_AUDIT_EVENTS.voucherSent, entityType: "RetailVoucher", entityId: id, payload: { code: row.code, via: "WhatsApp" } });
    return { sent: true as const, message: `${row.code} sent to ${row.customer!.name} on WhatsApp.` };
  });
}

/** "US$50.00 of US$50.00" (the edit sheet's Left on it). */
export const leftOfValue = (view: Pick<VoucherView, "left" | "value" | "leftLabel" | "copies">) =>
  view.left !== null && view.value !== null ? `${formatMoney(view.left)} of ${formatMoney(view.value)}` : `${view.leftLabel} of ${view.copies}`;
