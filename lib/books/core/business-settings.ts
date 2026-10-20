import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { canDo, type BooksActor } from "./can-do";
import { baseCurrencyChangeRefusal } from "./currency";
import { saveTaxSettings, taxSettings, type VatCategory } from "./tax-settings";

/**
 * Management › Company › Money and tax (books-final §3.2 "In Management"):
 * the legal name, VAT number, TIN, VAT category, base currency, rate source
 * and financial year end. Core and free: a workspace without Books' screens
 * sets them here, and every document and return reads them.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type BusinessSettings = {
  legalName: string;
  tradingName: string;
  vatNumber: string;
  taxNumber: string;
  address: string;
  phone: string;
  email: string;
  vatCategory: VatCategory;
  vatPeriodMonths: number;
  vatWithholdingAgent: boolean;
  baseCurrency: string;
  rateSource: "RBZ" | "MANUAL";
  /** 1–12: the month the financial year ends in. */
  yearEndMonth: number;
  retainedEarningsAccountId: string | null;
};

export class BusinessRefused extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly field?: string,
  ) {
    super(message);
    this.name = "BusinessRefused";
  }
}

/** The month a year ending in `yearEndMonth` starts in. Pure. */
export const yearStartMonth = (yearEndMonth: number) => (yearEndMonth % 12) + 1;
/** And back. Pure. */
export const yearEndMonthOf = (startMonth: number) => ((startMonth + 10) % 12) + 1;

/** A Zimbabwe VAT number is 8 digits beginning with 22; a TIN 10 digits beginning with 2 (ZIMRA's TaRMS forms). Pure. */
export function taxNumberProblem(field: "vatNumber" | "taxNumber", value: string): string | null {
  const digits = value.replace(/\s/g, "");
  if (!digits) return null;
  if (field === "vatNumber" && !/^\d{8,9}$/.test(digits)) return "A VAT number is 8 or 9 digits.";
  if (field === "taxNumber" && !/^\d{10}$/.test(digits)) return "A TIN is 10 digits.";
  return null;
}

export async function businessSettings(companyId: string, db: Db = prisma): Promise<BusinessSettings> {
  const [row, tax, company] = await Promise.all([
    db.accountingSettings.findUnique({ where: { companyId }, select: { legalName: true, tradingName: true, vatNumber: true, taxNumber: true, address: true, phone: true, email: true, baseCurrency: true, fiscalYearStartMonth: true, retainedEarningsAccountId: true } }),
    taxSettings(companyId, db),
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  return {
    legalName: row?.legalName ?? "",
    tradingName: row?.tradingName ?? company?.name ?? "",
    vatNumber: row?.vatNumber ?? "",
    taxNumber: row?.taxNumber ?? "",
    address: row?.address ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    vatCategory: tax.vat.category,
    vatPeriodMonths: tax.vat.periodMonths,
    vatWithholdingAgent: tax.vat.withholdingAgent,
    baseCurrency: row?.baseCurrency ?? "USD",
    rateSource: tax.rates.source,
    yearEndMonth: yearEndMonthOf(row?.fiscalYearStartMonth ?? 1),
    retainedEarningsAccountId: row?.retainedEarningsAccountId ?? null,
  };
}

/** Save what changed (the owner or the accountant). The base currency cannot change once anything has posted. */
export async function saveBusinessSettings(actor: BooksActor, patch: Partial<BusinessSettings>): Promise<BusinessSettings> {
  const decision = canDo(actor, "setup");
  if (!decision.allowed) throw new BusinessRefused(decision.reason, 403);
  for (const field of ["vatNumber", "taxNumber"] as const) {
    const problem = patch[field] !== undefined ? taxNumberProblem(field, patch[field]!) : null;
    if (problem) throw new BusinessRefused(problem, 400, field);
  }
  if (patch.baseCurrency) {
    const refusal = await baseCurrencyChangeRefusal(prisma, actor.companyId, patch.baseCurrency);
    if (refusal) throw new BusinessRefused(refusal, 409, "baseCurrency");
  }
  if (patch.retainedEarningsAccountId) {
    const account = await prisma.chartOfAccount.findFirst({ where: { id: patch.retainedEarningsAccountId, companyId: actor.companyId, type: "EQUITY" }, select: { id: true } });
    if (!account) throw new BusinessRefused("Retained earnings is an equity account in this chart.", 400, "retainedEarningsAccountId");
  }
  const text = (value: string | undefined) => (value === undefined ? undefined : value.trim() || null);
  const data = {
    legalName: text(patch.legalName),
    tradingName: text(patch.tradingName),
    vatNumber: text(patch.vatNumber?.replace(/\s/g, "")),
    taxNumber: text(patch.taxNumber?.replace(/\s/g, "")),
    address: text(patch.address),
    phone: text(patch.phone),
    email: text(patch.email),
    ...(patch.baseCurrency ? { baseCurrency: patch.baseCurrency.trim().toUpperCase() } : {}),
    ...(patch.yearEndMonth ? { fiscalYearStartMonth: yearStartMonth(patch.yearEndMonth) } : {}),
    ...(patch.retainedEarningsAccountId !== undefined ? { retainedEarningsAccountId: patch.retainedEarningsAccountId } : {}),
  };
  const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  await prisma.accountingSettings.upsert({ where: { companyId: actor.companyId }, update: clean, create: { companyId: actor.companyId, ...clean } });
  const vat: Partial<{ category: VatCategory; periodMonths: number; withholdingAgent: boolean }> = {};
  if (patch.vatCategory) vat.category = patch.vatCategory;
  if (patch.vatPeriodMonths) vat.periodMonths = patch.vatPeriodMonths;
  if (patch.vatWithholdingAgent !== undefined) vat.withholdingAgent = patch.vatWithholdingAgent;
  if (Object.keys(vat).length || patch.rateSource) await saveTaxSettings(actor.companyId, { ...(Object.keys(vat).length ? { vat } : {}), ...(patch.rateSource ? { rates: { source: patch.rateSource } } : {}) });
  return businessSettings(actor.companyId);
}
