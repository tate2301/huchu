import { randomInt } from "node:crypto";

import { Prisma, type RetailVoucherFunding, type RetailVoucherKind, type RetailVoucherSendBy } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { centsOf } from "@/lib/retail/prices/figure";
import { formatCount, formatMoney, parseDay } from "@/lib/workspace/format";

import { addMonths, dateOf, latestExpiry, voucherToday } from "./dates";
import { postVoucherIssue } from "./posting";
import {
  ANYONE,
  isMoneyKind,
  KIND_ENTITY,
  SECRET_ALPHABET,
  SECRET_LENGTH,
  valueWords,
  voucherMessage,
} from "./words";

/**
 * Issuing vouchers (W-18, PRD-10, 20-products §4.10): one voucher with its
 * code off its kind's line of numbers and a secret (`issueVoucher`, inside the
 * caller's transaction: the back office, a sale at the till, a refund's
 * credit note), and the Issue vouchers sheet's request (`issueVouchers`):
 * gift vouchers and credit notes by the number asked for, or one discount
 * voucher printed that many times, sent on WhatsApp or printed.
 */

type Tx = Prisma.TransactionClient;

export class VoucherRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "VoucherRefusal";
  }
}

const refuse = (field: string, message: string): never => {
  throw new VoucherRefusal(400, message, { [field]: message });
};

/** Six characters from an alphabet nothing in it can be mistaken for another. */
export function newSecret(): string {
  return Array.from({ length: SECRET_LENGTH }, () => SECRET_ALPHABET[randomInt(SECRET_ALPHABET.length)]).join("");
}

/** Templates the outbox knows it by. */
export const VOUCHER_TEMPLATE = "voucher";

export type IssueOne = {
  actor: RetailAuditActor;
  kind: RetailVoucherKind;
  funding: RetailVoucherFunding;
  /** Money vouchers: what it is worth, in cents. */
  valueCents?: number | null;
  /** Discount vouchers: one of these. */
  percentOff?: number | null;
  amountOffCents?: number | null;
  /** Discount vouchers: how many printed, each one use. */
  copies?: number;
  customerId?: string | null;
  holderNote?: string | null;
  minSaleCents?: number | null;
  /** `YYYY-MM-DD`. */
  expiresOn: string;
  siteId?: string | null;
  sendBy: RetailVoucherSendBy;
  soldSaleId?: string | null;
  issuedAt?: Date;
};

export type Issued = { id: string; code: string; secret: string; kind: RetailVoucherKind; valueLabel: string; expiresOn: string };

const fromCents = (cents: number) => new Prisma.Decimal(cents).dividedBy(100);

export async function issueVoucher(tx: Tx, input: IssueOne): Promise<Issued> {
  const { companyId } = input.actor;
  const code = await reserveIdentifier(tx, { companyId, entity: KIND_ENTITY[input.kind] });
  const secret = newSecret();
  const money = isMoneyKind(input.kind);
  const copies = money ? 1 : Math.max(1, input.copies ?? 1);
  const valueCents = money ? (input.valueCents ?? 0) : null;
  const row = await tx.retailVoucher.create({
    data: {
      companyId,
      code,
      secret,
      kind: input.kind,
      funding: input.funding,
      value: valueCents === null ? null : fromCents(valueCents),
      balance: valueCents === null ? 0 : fromCents(valueCents),
      percentOff: money || input.percentOff == null ? null : new Prisma.Decimal(input.percentOff),
      amountOff: money || input.amountOffCents == null ? null : fromCents(input.amountOffCents),
      copies,
      usesLeft: money ? null : copies,
      customerId: input.customerId ?? null,
      holderNote: input.customerId ? null : input.holderNote?.trim() || null,
      minSale: input.minSaleCents ? fromCents(input.minSaleCents) : null,
      expiresOn: dateOf(input.expiresOn),
      siteId: input.siteId ?? null,
      sendBy: input.sendBy,
      soldSaleId: input.soldSaleId ?? null,
      issuedById: input.actor.userId,
      ...(input.issuedAt ? { issuedAt: input.issuedAt, createdAt: input.issuedAt } : {}),
    },
    select: { id: true },
  });
  const valueLabel = valueWords({
    kind: input.kind,
    value: valueCents === null ? null : valueCents / 100,
    percentOff: input.percentOff ?? null,
    amountOff: input.amountOffCents == null ? null : input.amountOffCents / 100,
  });
  await writeRetailAuditEvent(tx, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.voucherIssued,
    entityType: "RetailVoucher",
    entityId: row.id,
    payload: { code, kind: input.kind, value: money ? (valueCents! / 100).toFixed(2) : valueLabel, funding: input.funding },
  });
  return { id: row.id, code, secret, kind: input.kind, valueLabel, expiresOn: input.expiresOn };
}

/* ── The Issue vouchers sheet ─────────────────────────────────────────── */

export const voucherInput = z.object({
  kind: z.enum(["GIFT", "CREDIT_NOTE", "DISCOUNT"], { message: "Pick a kind." }),
  value: z.string().max(40),
  howMany: z.coerce.number({ message: "How many is a whole number." }).int("How many is a whole number.").min(1, "At least 1.").max(200, "At most 200 at a time."),
  /** A customer picked from the lookup (CUS-02's `customer` noun, packet 53). */
  customerId: z.string().uuid("Pick one of this shop's customers.").optional().nullable(),
  /** "For" as typed until the customer lookup lands: a customer's name, or who it is for ("Delta reps"). */
  holder: z.string().trim().max(120, "Keep it to 120 characters.").optional().nullable(),
  expires: z.string().max(60),
  minSale: z.string().max(40).optional().nullable(),
  sendBy: z.enum(["PRINT", "WHATSAPP", "BOTH"]).default("PRINT"),
});
export type VoucherInput = z.infer<typeof voucherInput>;

export const MONEY_MESSAGE = "Write the value as a figure, like 50.00.";
export const EXPIRES_MESSAGE = "Pick a date after today, within 3 years.";
const MAX_CENTS = 100_000;

/** "50.00" in cents, ≤ US$1,000.00. */
function moneyValue(text: string): number {
  const cents = centsOf(text);
  if (cents === null) return refuse("value", MONEY_MESSAGE);
  if (cents <= 0) return refuse("value", "A voucher is worth more than nothing.");
  if (cents > MAX_CENTS) return refuse("value", "A voucher is worth at most US$1,000.00.");
  return cents;
}

/** A promotion's value: "10%" (at most 90) or an amount off ("5.00"). */
function discountValue(text: string): { percentOff: number | null; amountOffCents: number | null } {
  const percent = /^\s*(\d{1,2}(?:\.\d{1,2})?)\s*%\s*$/.exec(text);
  if (percent) {
    const value = Number(percent[1]);
    if (value <= 0 || value > 90) return refuse("value", "Take between 1% and 90% off.");
    return { percentOff: value, amountOffCents: null };
  }
  const cents = centsOf(text);
  if (cents === null) return refuse("value", "Write 10% or an amount off, like 5.00.");
  if (cents <= 0) return refuse("value", "Take something off.");
  if (cents > MAX_CENTS) return refuse("value", "Take at most US$1,000.00 off.");
  return { percentOff: null, amountOffCents: cents };
}

/** "3 October 2027" or "2027-10-03", after today and within three years. */
export function expiryDay(text: string, today: string, field = "expires"): string {
  const day = parseDay(text);
  if (!day) return refuse(field, "Write a date, like 3 October 2027.");
  if (day <= today || day > latestExpiry(today)) return refuse(field, EXPIRES_MESSAGE);
  return day;
}

type Holder = { customer: { id: string; name: string; phone: string | null } | null; note: string | null };

/**
 * Who it is for: a picked customer, or the words typed under For. Typed words
 * that are a live customer's name are that customer, so their WhatsApp number
 * is known; anything else is kept as who it is for ("Delta reps").
 */
export async function resolveHolder(db: Tx | typeof prisma, companyId: string, input: { customerId?: string | null; holder?: string | null }): Promise<Holder> {
  if (input.customerId) {
    const customer = await db.customer.findFirst({
      where: { id: input.customerId, companyId, isActive: true },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) return refuse("customerId", "Pick one of this shop's customers.");
    return { customer, note: null };
  }
  const typed = input.holder?.trim() || null;
  if (!typed) return { customer: null, note: null };
  const named = await db.customer.findMany({
    where: { companyId, isActive: true, name: { equals: typed, mode: "insensitive" } },
    select: { id: true, name: true, phone: true },
    take: 2,
  });
  return named.length === 1 ? { customer: named[0]!, note: null } : { customer: null, note: typed };
}

/** Why it cannot go on WhatsApp, under Send by; null when it can. */
export function sendRefusal(holder: Holder): string | null {
  if (holder.customer?.phone) return null;
  const who = holder.customer?.name ?? holder.note;
  return who ? `${who} has no WhatsApp number.` : `${ANYONE} has no one to send to.`;
}

/** "Hurudza Creative" and "Harare Bottle Store": who it is from and where it is spent. */
export async function shopNames(db: Tx | typeof prisma, companyId: string): Promise<{ company: string; shop: string }> {
  const [company, branding] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.companyBranding.findUnique({ where: { companyId }, select: { tradingName: true, displayName: true } }),
  ]);
  const name = company?.name ?? "The shop";
  return { company: name, shop: branding?.tradingName || branding?.displayName || name };
}

/** One WhatsApp message per voucher, queued in the outbox with the vouchers. */
export async function queueVoucherMessages(
  tx: Tx,
  input: { companyId: string; to: string; vouchers: Issued[]; createdById: string | null },
): Promise<number> {
  const names = await shopNames(tx, input.companyId);
  await tx.retailMessage.createMany({
    data: input.vouchers.map((voucher) => ({
      companyId: input.companyId,
      channel: "WHATSAPP" as const,
      to: input.to,
      template: VOUCHER_TEMPLATE,
      body: voucherMessage({ ...names, kind: voucher.kind, value: voucher.valueLabel, code: voucher.code, secret: voucher.secret, expiresOn: voucher.expiresOn }),
      entityType: "RetailVoucher",
      entityId: voucher.id,
      createdById: input.createdById,
    })),
  });
  return input.vouchers.length;
}

export const printUrlOf = (ids: string[]) => `/api/v2/retail/vouchers/print?ids=${ids.join(",")}`;

const KIND_PLURAL: Record<RetailVoucherKind, string> = { GIFT: "gift vouchers", CREDIT_NOTE: "credit notes", DISCOUNT: "discount vouchers" };

/**
 * The toast: "GV-0022 for US$50.00 sent to Tapiwa Marange on WhatsApp.",
 * "GV-0022 for US$50.00 is ready to print.", "5 gift vouchers for US$20.00 are
 * ready to print.", "DV-0008, 10% off, 20 printed.".
 */
export function issuedWords(input: { kind: RetailVoucherKind; codes: string[]; valueLabel: string; copies: number; sendBy: RetailVoucherSendBy; to: string | null }): string {
  const sent = input.sendBy !== "PRINT" && input.to ? `sent to ${input.to} on WhatsApp` : null;
  const print = input.sendBy !== "WHATSAPP";
  if (input.kind === "DISCOUNT") {
    const printed = print ? `${formatCount(input.copies)} printed` : null;
    return `${input.codes[0]}, ${input.valueLabel}, ${[printed, sent].filter(Boolean).join(" and ")}.`;
  }
  const one = input.codes.length === 1;
  const lead = one ? `${input.codes[0]} for ${input.valueLabel}` : `${formatCount(input.codes.length)} ${KIND_PLURAL[input.kind]} for ${input.valueLabel}`;
  const ready = one ? "is ready to print" : "are ready to print";
  if (sent && print) return `${lead} ${sent} and ${one ? "is" : "are"} ready to print.`;
  if (sent) return `${lead} ${sent}.`;
  return `${lead} ${ready}.`;
}

export type IssuedAnswer = { vouchers: Array<{ id: string; code: string }>; printUrl: string | null; sent: number; message: string };

/**
 * `POST /api/v2/retail/vouchers` (promotions:create). Back-office vouchers
 * are given (20-products OQ 8): money vouchers post Dr Promotions and gifts /
 * Cr Vouchers owed for their value times how many, after the commit.
 */
export async function issueVouchers(actor: RetailAuditActor, input: VoucherInput, now: Date = new Date()): Promise<IssuedAnswer> {
  const { companyId } = actor;
  const today = voucherToday(now);
  const money = isMoneyKind(input.kind);
  const valueCents = money ? moneyValue(input.value) : null;
  const discount = money ? null : discountValue(input.value);
  const expiresOn = expiryDay(input.expires, today);
  const minSaleText = input.minSale?.trim() ?? "";
  const minSaleCents = minSaleText ? centsOf(minSaleText) : null;
  if (minSaleText && minSaleCents === null) refuse("minSale", "Write it as a figure, like 20.00.");
  const holder = await resolveHolder(prisma, companyId, input);
  const sendsOnWhatsApp = input.sendBy !== "PRINT";
  if (sendsOnWhatsApp) {
    const refusal = sendRefusal(holder);
    if (refusal) refuse("send", refusal);
  }

  const issued = await prisma.$transaction(
    async (tx) => {
      const made: Issued[] = [];
      const count = money ? input.howMany : 1;
      for (let index = 0; index < count; index += 1) {
        made.push(
          await issueVoucher(tx, {
            actor,
            kind: input.kind,
            funding: "GIVEN",
            valueCents,
            percentOff: discount?.percentOff ?? null,
            amountOffCents: discount?.amountOffCents ?? null,
            copies: money ? 1 : input.howMany,
            customerId: holder.customer?.id ?? null,
            holderNote: holder.note,
            minSaleCents: minSaleCents || null,
            expiresOn,
            sendBy: input.sendBy,
            issuedAt: now,
          }),
        );
      }
      let sent = 0;
      if (sendsOnWhatsApp && holder.customer?.phone) {
        sent = await queueVoucherMessages(tx, { companyId, to: holder.customer.phone, vouchers: made, createdById: actor.userId });
        await tx.retailVoucher.updateMany({ where: { id: { in: made.map((voucher) => voucher.id) } }, data: { sentAt: now } });
      }
      return { made, sent };
    },
    { timeout: 60_000 },
  );

  if (money) {
    await postVoucherIssue(
      { companyId, userId: actor.userId, userRole: actor.userRole },
      { firstId: issued.made[0]!.id, codes: issued.made.map((voucher) => voucher.code), total: (valueCents! * issued.made.length) / 100, siteId: null, at: now },
    );
  }
  const ids = issued.made.map((voucher) => voucher.id);
  return {
    vouchers: issued.made.map((voucher) => ({ id: voucher.id, code: voucher.code })),
    printUrl: input.sendBy === "WHATSAPP" ? null : printUrlOf(ids),
    sent: issued.sent,
    message: issuedWords({
      kind: input.kind,
      codes: issued.made.map((voucher) => voucher.code),
      valueLabel: issued.made[0]!.valueLabel,
      copies: input.howMany,
      sendBy: input.sendBy,
      to: holder.customer?.name ?? null,
    }),
  };
}

/* ── Vouchers the floor makes (FLR-02, FLR-10 call these) ─────────────── */

/**
 * A refund paid as a credit note (D-4): CREDIT_NOTE, funded REFUND, good for
 * three months at every site. The refund's own journal pays it (tender
 * VOUCHER credits Vouchers owed), so nothing posts here.
 */
export async function issueCreditNote(
  tx: Tx,
  input: { actor: RetailAuditActor; sourceSaleId: string; value: string | number; customerId?: string | null; now?: Date },
): Promise<Issued> {
  const now = input.now ?? new Date();
  const cents = Math.round(Number(input.value) * 100);
  if (!(cents > 0)) throw new VoucherRefusal(400, "A credit note is worth more than nothing.");
  return issueVoucher(tx, {
    actor: input.actor,
    kind: "CREDIT_NOTE",
    funding: "REFUND",
    valueCents: cents,
    customerId: input.customerId ?? null,
    expiresOn: addMonths(voucherToday(now), 3),
    sendBy: "PRINT",
    soldSaleId: input.sourceSaleId,
    issuedAt: now,
  });
}

/** Gift vouchers bought in a sale (`pos/sales` `vouchersSold`): GIFT, funded SOLD, good for a year at every site. */
export async function sellGiftVouchers(
  tx: Tx,
  input: { actor: RetailAuditActor; saleId: string; vouchers: Array<{ valueCents: number; customerId?: string | null }>; now: Date },
): Promise<Issued[]> {
  const made: Issued[] = [];
  for (const voucher of input.vouchers) {
    made.push(
      await issueVoucher(tx, {
        actor: input.actor,
        kind: "GIFT",
        funding: "SOLD",
        valueCents: voucher.valueCents,
        customerId: voucher.customerId ?? null,
        expiresOn: addMonths(voucherToday(input.now), 12),
        sendBy: "PRINT",
        soldSaleId: input.saleId,
        issuedAt: input.now,
      }),
    );
  }
  return made;
}

/** "US$20.00" for a list of cents, as the till's toast says what was sold. */
export const centsWords = (cents: number) => formatMoney(cents / 100);
