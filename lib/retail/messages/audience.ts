import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { figuresSql } from "@/lib/retail/customers/stats";
import { loadLoyaltySettings, type LoyaltySettings } from "@/lib/retail/loyalty/settings";
import { sortTiers } from "@/lib/retail/loyalty/tiers";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";

/**
 * Who a message to customers goes to (CUS-06, W-50).
 *
 * Offers go to an audience of live customers (not binned, not merged away):
 * - `ticked`: the ids the owner ticked;
 * - `top-tier`: those in the top tier now (a held tier counts, as `tierFor`);
 * - `lapsed-30`: those whose last visit is more than 30 days ago (never
 *   visiting is not lapsing: they are left out);
 * - `all-agreed`: everyone who agreed to messages.
 * The reach is who of them agreed to marketing and has a WhatsApp number
 * (`whatsapp`, else `phone`).
 *
 * Reminders (lay-bys, accounts) go to the customers of the records ticked on
 * those screens: consent is not needed, a number is. Each kind is a
 * `ReminderSource` its own unit registers in `REMINDER_SOURCES` (packet 58
 * lay-bys, 69 accounts).
 */

export const OFFER_AUDIENCES = ["ticked", "top-tier", "lapsed-30", "all-agreed"] as const;
export type OfferAudience = (typeof OFFER_AUDIENCES)[number];

export const LAPSED_DAYS = 30;
const DAY_MS = 86_400_000;

/** A customer a message reaches: who, their number, and their points now. */
export type Reached = { id: string; name: string; to: string; points: number };

export type OfferReach = { total: number; reached: Reached[] };

type AudienceRow = { id: string; name: string; points: number; marketingConsent: boolean; to: string | null };

/** The top tier's name, or null for a scheme with no tiers. */
export function topTierName(settings: Pick<LoyaltySettings, "tiers">): string | null {
  const tiers = sortTiers(settings.tiers);
  return tiers.length ? tiers[tiers.length - 1]!.name : null;
}

function audienceWhere(audience: OfferAudience, input: { now: Date; top: string | null }): Prisma.Sql {
  switch (audience) {
    case "ticked":
      return Prisma.sql`TRUE`;
    case "top-tier":
      return input.top === null ? Prisma.sql`FALSE` : Prisma.sql`f.tier = ${input.top}`;
    case "lapsed-30":
      return Prisma.sql`f."lastVisitAt" IS NOT NULL AND f."lastVisitAt" < ${new Date(input.now.getTime() - LAPSED_DAYS * DAY_MS)}`;
    case "all-agreed":
      return Prisma.sql`f."marketingConsent"`;
  }
}

/** The audience of an offer and who of them it reaches, A–Z. */
export async function offerAudience(
  companyId: string,
  audience: OfferAudience,
  options: { ids?: string[]; now?: Date; settings?: LoyaltySettings } = {},
): Promise<OfferReach> {
  if (audience === "ticked" && !options.ids?.length) return { total: 0, reached: [] };
  const now = options.now ?? new Date();
  const settings = options.settings ?? (await loadLoyaltySettings(companyId));
  const rows = await prisma.$queryRaw<AudienceRow[]>`
    WITH ${figuresSql({ companyId, now, tiers: settings.tiers, ids: audience === "ticked" ? options.ids : undefined })}
    SELECT f.id, f.name, f.points::int AS points, f."marketingConsent",
           coalesce(nullif(trim(c.whatsapp), ''), nullif(trim(c.phone), '')) AS "to"
    FROM figures f
    JOIN "Customer" c ON c.id = f.id
    WHERE ${audienceWhere(audience, { now, top: topTierName(settings) })}
    ORDER BY f.name ASC, f.id ASC`;
  const reached = rows
    .filter((row) => row.marketingConsent && row.to)
    .map((row) => ({ id: row.id, name: row.name, to: row.to!, points: Number(row.points) }));
  return { total: rows.length, reached };
}

/* ── Reminders ──────────────────────────────────────────────────────────── */

export type Grant = [RetailResource, RetailAction];

/** One record a reminder is about (a lay-by, an account) and its customer. */
export type ReminderItem = {
  customer: { id: string; name: string; phone: string | null; whatsapp: string | null };
  /** The record's id, kept on the message (`entityId`) so a scheduled one re-fills at send time. */
  about: string;
  /** The source's placeholders' values for this record, `{first name}` included. */
  values: Record<string, string>;
  /** Run inside the send's transaction once queued (a lay-by's `lastRemindedAt`). */
  after?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type ReminderSource = {
  /** Who may send these reminders (the server checks; the sheet opens for Customers' grant). */
  requires: Grant;
  /** What the messages are about, as `RetailMessage.entityType` ("RetailLayby"). */
  entityType: string;
  load(companyId: string, ids: string[]): Promise<ReminderItem[]>;
  /** Without braces: ["first name", "owed", "overdue"]. */
  placeholders: string[];
  /** The hint under the message, and the refusal for any other placeholder. */
  hint: string;
  defaultBody(shop: string): string;
  /** The sheet's sub: "4 ticked · 3 on WhatsApp". */
  sub(n: number, withNumber: number): string;
};

export type ReminderKind = "layby" | "account";

/** Registered by packets 58 (lay-bys) and 69 (accounts). */
export const REMINDER_SOURCES: Partial<Record<ReminderKind, ReminderSource>> = {};

export const REMINDER_PURPOSE = { layby: "LAYBY_REMINDER", account: "ACCOUNT_REMINDER" } as const;
export const REMINDER_TEMPLATE = { layby: "layby-reminder", account: "account-reminder" } as const;

/** "layby:<id>,<id>" → the kind and the ids; null for anything else. */
export function parseAbout(about: string | null | undefined): { kind: ReminderKind; ids: string[] } | null {
  const match = /^(layby|account):(.*)$/.exec(about?.trim() ?? "");
  if (!match) return null;
  const ids = match[2]!.split(",").map((id) => id.trim()).filter(Boolean);
  return ids.length ? { kind: match[1] as ReminderKind, ids } : null;
}

export type ReminderReached = ReminderItem & { to: string };

/** The records' customers, and who of them has a number (consent is not asked). */
export async function reminderAudience(
  companyId: string,
  source: ReminderSource,
  ids: string[],
): Promise<{ total: number; reached: ReminderReached[] }> {
  const items = await source.load(companyId, ids);
  const reached = items.flatMap((item) => {
    const to = item.customer.whatsapp?.trim() || item.customer.phone?.trim() || null;
    return to ? [{ ...item, to }] : [];
  });
  return { total: items.length, reached };
}
