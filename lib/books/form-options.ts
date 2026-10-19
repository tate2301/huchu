import type { PrismaClient } from "@prisma/client";

import { ID_ENTITY_CONFIG } from "@/lib/id-generator";
import { resolveBaseCurrency } from "@/lib/money";

import { SERIES, type NumberedDocument } from "./core/numbering";
import type { BooksFormOptions } from "./form-options-view";

/**
 * What Books' forms choose from (BkInvoiceNew, BkPaymentNew, BkBillNew,
 * BkPaymentOutNew): the parties, the tax codes, the cost centres, the money
 * accounts, today's rates and the number the document will take at issue.
 * The number is only shown: it is given in the issuing write (`nextNumber`).
 */

type Db = PrismaClient;

/** The number the next document of a series will take, read without taking it. */
export async function peekNumber(db: Db, companyId: string, type: NumberedDocument): Promise<string> {
  const entity = SERIES[type];
  const { prefix } = ID_ENTITY_CONFIG[entity];
  const row = await db.idSequence.findUnique({
    where: { companyId_entityKey_scopeKey: { companyId, entityKey: entity, scopeKey: "GLOBAL" } },
    select: { lastNumber: true },
  });
  return `${prefix}-${String((row?.lastNumber ?? 0) + 1).padStart(4, "0")}`;
}

export async function readFormOptions(db: Db, companyId: string, parties: "customers" | "suppliers", series: NumberedDocument): Promise<BooksFormOptions> {
  const base = (await resolveBaseCurrency(companyId)).toUpperCase();
  const [customers, suppliers, taxCodes, centres, accounts, rates, next] = await Promise.all([
    parties === "customers"
      ? db.customer.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, vatNumber: true, taxNumber: true }, orderBy: { name: "asc" }, take: 2000 })
      : Promise.resolve([]),
    parties === "suppliers"
      ? db.vendor.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, vatNumber: true, taxNumber: true }, orderBy: { name: "asc" }, take: 2000 })
      : Promise.resolve([]),
    db.taxCode.findMany({
      where: { companyId, isActive: true, appliesTo: { in: [parties === "customers" ? "SALES" : "PURCHASE", "BOTH"] } },
      select: { id: true, code: true, name: true, rate: true, type: true },
      orderBy: [{ rate: "desc" }, { code: "asc" }],
    }),
    db.costCenter.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.bankAccount.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, bankName: true, currency: true, kind: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.currencyRate.findMany({ where: { companyId, baseCurrency: base }, orderBy: { effectiveDate: "desc" }, select: { quoteCurrency: true, rate: true, source: true, effectiveDate: true }, take: 30 }),
    peekNumber(db, companyId, series),
  ]);
  const latest = new Map<string, { rate: number; source: string; day: string }>();
  for (const rate of rates) {
    if (!latest.has(rate.quoteCurrency)) latest.set(rate.quoteCurrency, { rate: rate.rate, source: rate.source === "RBZ" ? "RBZ interbank" : "Typed in", day: rate.effectiveDate.toISOString().slice(0, 10) });
  }
  // Zimbabwe's two: US dollars and ZiG are always offered (books-final §9.6), with any other the workspace holds.
  const currencies = [base, ...new Set(["USD", "ZWG", ...accounts.map((account) => account.currency.toUpperCase()), ...latest.keys()].filter((code) => code !== base))];
  return {
    base,
    currencies,
    rates: Object.fromEntries(latest),
    parties: (parties === "customers" ? customers : suppliers).map((party) => ({ id: party.id, name: party.name, vatNumber: party.vatNumber, tin: party.taxNumber })),
    taxCodes: taxCodes
      .filter((code) => code.type !== "WITHHOLDING")
      .map((code) => ({ id: code.id, label: code.rate > 0 ? `${code.type === "VAT" ? "VAT" : code.code} ${code.rate}%` : code.name, rate: code.rate })),
    costCentres: centres.map((centre) => ({ id: centre.id, label: centre.name })),
    accounts: accounts.map((account) => ({
      id: account.id,
      label: `${account.bankName && account.bankName !== account.name ? `${account.bankName} ${account.name}` : account.name}, ${account.currency.toUpperCase()}`,
      currency: account.currency.toUpperCase(),
      kind: account.kind,
    })),
    nextNumber: next,
  };
}
