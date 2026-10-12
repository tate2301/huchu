import type { Prisma } from "@prisma/client";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { ReminderItem, ReminderSource } from "@/lib/retail/messages/audience";
import { firstName, placeholderWords, renderMessage } from "@/lib/retail/messages/render";
import { shopName } from "@/lib/retail/messages/send-now";
import { formatCount } from "@/lib/workspace/format";

import { dayMonth, LAYBY_PLACEHOLDERS, laybyReminderBody, usd } from "./layby-words";

/**
 * Reminders about lay-bys (FLR-06): the source packet 55's "Remind on
 * WhatsApp" sheet reads for ticked lay-bys, and the weekly reminder the
 * retail worker sends to each customer still paying who asked for one.
 * Neither needs marketing consent: a reminder is about their own lay-by.
 */

const DAY_MS = 86_400_000;
export const REMINDER_EVERY_DAYS = 7;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

type Row = {
  id: string;
  laybyNo: string;
  total: Prisma.Decimal;
  paid: Prisma.Decimal;
  dueOn: Date;
  customer: { id: string; name: string; phone: string | null; whatsapp: string | null };
};

/** `{lay-by}`, `{left}`, `{due}` for one lay-by. */
export function laybyValues(layby: Pick<Row, "laybyNo" | "total" | "paid" | "dueOn">): Record<string, string> {
  return {
    "lay-by": layby.laybyNo,
    left: usd(money(layby.total).minus(money(layby.paid)).toFixed(2)),
    due: dayMonth(dayOf(layby.dueOn)),
  };
}

const SELECT = {
  id: true,
  laybyNo: true,
  total: true,
  paid: true,
  dueOn: true,
  customer: { select: { id: true, name: true, phone: true, whatsapp: true } },
} satisfies Prisma.RetailLaybySelect;

export const laybyReminderSource: ReminderSource = {
  requires: ["retail.laybys", "update"],
  entityType: "RetailLayby",
  async load(companyId, ids) {
    const rows = await prisma.retailLayby.findMany({
      where: { companyId, id: { in: ids }, status: "PAYING" },
      orderBy: { laybyNo: "asc" },
      select: SELECT,
    });
    return rows.map(
      (row): ReminderItem => ({
        customer: row.customer,
        about: row.id,
        values: laybyValues(row),
        after: async (tx) => {
          await tx.retailLayby.update({ where: { id: row.id }, data: { lastRemindedAt: new Date() } });
        },
      }),
    );
  },
  placeholders: [...LAYBY_PLACEHOLDERS],
  hint: `${placeholderWords(LAYBY_PLACEHOLDERS)} fill in for each lay-by.`,
  defaultBody: laybyReminderBody,
  sub: (n, withNumber) =>
    `${formatCount(n)} ${n === 1 ? "lay-by" : "lay-bys"}${withNumber < n ? ` · ${formatCount(withNumber)} on WhatsApp` : ""}`,
};

/**
 * The weekly reminder (worker `layby-reminders`, 09:00): every lay-by still
 * being paid with reminders on, last reminded (or started) a week ago or
 * more, whose customer has a number. Returns how many were sent.
 */
export async function sendLaybyReminders(companyId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - REMINDER_EVERY_DAYS * DAY_MS);
  const rows = await prisma.retailLayby.findMany({
    where: {
      companyId,
      status: "PAYING",
      remindWeekly: true,
      OR: [{ lastRemindedAt: { lte: since } }, { lastRemindedAt: null, createdAt: { lte: since } }],
    },
    orderBy: { laybyNo: "asc" },
    select: SELECT,
  });
  if (rows.length === 0) return 0;
  const template = laybyReminderBody(await shopName(companyId));
  let sent = 0;
  for (const row of rows) {
    const to = row.customer.whatsapp?.trim() || row.customer.phone?.trim() || null;
    if (!to) continue;
    await prisma.$transaction(async (tx) => {
      // Claimed by moving its last reminder on, so two workers never remind twice.
      const claimed = await tx.retailLayby.updateMany({
        where: { id: row.id, OR: [{ lastRemindedAt: { lte: since } }, { lastRemindedAt: null }] },
        data: { lastRemindedAt: now },
      });
      if (claimed.count !== 1) return;
      await tx.retailMessage.create({
        data: {
          companyId,
          channel: "WHATSAPP",
          to,
          template: "layby-reminder",
          body: renderMessage(template, { "first name": firstName(row.customer.name), ...laybyValues(row) }),
          customerId: row.customer.id,
          entityType: "RetailLayby",
          entityId: row.id,
        },
      });
      sent += 1;
    });
  }
  return sent;
}

/** Every shop's weekly lay-by reminders. */
export async function sendLaybyRemindersForAll(now: Date = new Date()): Promise<string> {
  const companies = await prisma.retailLayby.findMany({ where: { status: "PAYING", remindWeekly: true }, distinct: ["companyId"], select: { companyId: true } });
  let sent = 0;
  for (const { companyId } of companies) sent += await sendLaybyReminders(companyId, now);
  return `${sent} reminded`;
}
