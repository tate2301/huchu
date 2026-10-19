import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * ZIMRA's dates, rates and thresholds as settings (books-final §5.8–5.11; the
 * brief's default 5): today's research values (zw-research.md, 18 Oct 2026),
 * stored on `AccountingSettings.taxSettings` only where a workspace changes
 * them. Each value the research FLAGged is marked "to confirm" until somebody
 * saves it, so the screens can say so and an adviser's answer needs no
 * release.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type VatCategory = "A" | "B" | "C" | "D";

export type TaxSettings = {
  imtt: {
    /** 2% on USD transfers. */
    usdRate: number;
    /** 1.5% on ZWG transfers from 1 Jan 2026. */
    zwgRate: number;
    /** A single transfer over this (US$) pays the flat amount instead. */
    flatOverUsd: number;
    flatAmountUsd: number;
  };
  vat: {
    /** A and B every two months (A odd months, B even), C monthly, D as the Commissioner sets. */
    category: VatCategory;
    /** For category D: the months a period lasts. */
    periodMonths: number;
    /** Return by this day of the month after the period (SI 81 of 2025). */
    returnDay: number;
    /** Payment by this day. */
    paymentDay: number;
    /** The workspace is an appointed VAT withholding agent: it withholds a third of the VAT on suppliers' standard-rated supplies. */
    withholdingAgent: boolean;
    /** The share of VAT an agent withholds. */
    withholdingShare: number;
  };
  withholding: {
    /** 30% on payments to a supplier without a valid ITF263. */
    contractRate: number;
    /** Once a supplier's payments in the year come to this (US$). */
    thresholdUsd: number;
    returnDay: number;
    paymentDay: number;
  };
  paye: { returnDay: number; paymentDay: number };
  provisional: {
    /** The four instalments, percent of the year's estimated tax. */
    shares: [number, number, number, number];
    /** "MM-DD": returns. */
    returnDates: [string, string, string, string];
    /** "MM-DD": payments. */
    paymentDates: [string, string, string, string];
    /** The year's estimate, by year: tax due, and the US dollar share when the 50/50 basis applies. */
    estimates: Record<string, { taxUsd: number; foreignShare?: number | null; split5050?: boolean; incomeUsd?: number | null; revisedAt?: string | null; revisedBy?: string | null }>;
  };
};

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  imtt: { usdRate: 0.02, zwgRate: 0.015, flatOverUsd: 500_000, flatAmountUsd: 10_150 },
  vat: { category: "C", periodMonths: 1, returnDay: 10, paymentDay: 15, withholdingAgent: false, withholdingShare: 1 / 3 },
  withholding: { contractRate: 0.3, thresholdUsd: 1_000, returnDay: 5, paymentDay: 10 },
  paye: { returnDay: 5, paymentDay: 10 },
  provisional: {
    shares: [10, 25, 30, 35],
    returnDates: ["03-20", "06-20", "09-20", "12-15"],
    paymentDates: ["03-25", "06-25", "09-25", "12-20"],
    estimates: {},
  },
};

/** The values the research could not confirm (FLAG), and why: shown "to confirm" until somebody saves them. */
export const TO_CONFIRM: Record<string, string> = {
  "vat.returnDay": "SI 81 of 2025 moved the VAT return to the 10th; some ZIMRA pages still say the 25th.",
  "vat.paymentDay": "Payment moved to the 15th in 2025; some ZIMRA pages still say the 25th.",
  "withholding.thresholdUsd": "The US$1,000 threshold for 30% withholding dates from 2022 and was not reconfirmed for 2026.",
  "provisional.paymentDates": "QPD payment dates differ between notices (25 Mar, 25 Jun, 25 Sep, 20 Dec in one; 20 Jun in another).",
  "imtt.zwgRate": "1.5% on ZWG from 1 Jan 2026, from the 2026 budget commentary.",
};

type Stored = { [K in keyof TaxSettings]?: Partial<TaxSettings[K]> } & { confirmed?: string[] };

export type ResolvedTaxSettings = TaxSettings & { toConfirm: Array<{ key: string; why: string }> };

/** Defaults with a workspace's own values over them, pure. */
export function resolveTaxSettings(stored: unknown): ResolvedTaxSettings {
  const own = (stored && typeof stored === "object" ? stored : {}) as Stored;
  const merged = {} as TaxSettings;
  for (const key of Object.keys(DEFAULT_TAX_SETTINGS) as Array<keyof TaxSettings>) {
    (merged as Record<string, unknown>)[key] = { ...DEFAULT_TAX_SETTINGS[key], ...(own[key] ?? {}) };
  }
  const confirmed = new Set(own.confirmed ?? []);
  const toConfirm = Object.entries(TO_CONFIRM)
    .filter(([key]) => !confirmed.has(key))
    .map(([key, why]) => ({ key, why }));
  return { ...merged, toConfirm };
}

export async function taxSettings(companyId: string, db: Db = prisma): Promise<ResolvedTaxSettings> {
  const row = await db.accountingSettings.findUnique({ where: { companyId }, select: { taxSettings: true } });
  return resolveTaxSettings(row?.taxSettings ?? null);
}

/**
 * Saves a workspace's own values. A FLAGged value saved here counts as
 * confirmed: somebody has looked at it.
 */
export async function saveTaxSettings(companyId: string, patch: Stored, db: Db = prisma): Promise<ResolvedTaxSettings> {
  const row = await db.accountingSettings.findUnique({ where: { companyId }, select: { taxSettings: true } });
  const current = ((row?.taxSettings && typeof row.taxSettings === "object" ? row.taxSettings : {}) ?? {}) as Stored;
  const next: Stored = { ...current };
  const confirmed = new Set(current.confirmed ?? []);
  for (const key of Object.keys(DEFAULT_TAX_SETTINGS) as Array<keyof TaxSettings>) {
    const part = patch[key];
    if (!part) continue;
    (next as Record<string, unknown>)[key] = { ...(current[key] ?? {}), ...part };
    for (const field of Object.keys(part)) if (TO_CONFIRM[`${key}.${field}`]) confirmed.add(`${key}.${field}`);
  }
  for (const key of patch.confirmed ?? []) if (TO_CONFIRM[key]) confirmed.add(key);
  next.confirmed = [...confirmed].sort();
  const json = next as unknown as Prisma.InputJsonValue;
  await db.accountingSettings.upsert({ where: { companyId }, update: { taxSettings: json }, create: { companyId, taxSettings: json } });
  return resolveTaxSettings(next);
}
