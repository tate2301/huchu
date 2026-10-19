/**
 * What counts as money out, one `where` per kind of document (books-final §6.1
 * fix 13): Money's sum (`moneyInOut`) and All spending's rows
 * (`lib/books/spending.ts`) read from the same rule. No database here, so a
 * list's labels can be imported anywhere.
 */

export type When = { gte: Date; lt?: Date };

export const MONEY_OUT_WHERE = {
  supplierPayments: (companyId: string, when: When, currency: string, isBase: boolean) => ({
    companyId,
    status: "PAID" as const,
    requisitionId: null,
    paidAt: when,
    OR: [{ bill: { currency } }, ...(isBase ? [{ billId: null }] : [])],
  }),
  requisitions: (companyId: string, when: When, currency: string) => ({ companyId, currency, status: { in: ["DISBURSED" as const, "ACQUITTED" as const] }, disbursedAt: when }),
  claims: (companyId: string, when: When, currency: string) => ({ companyId, currency, status: "PAID" as const, paidAt: when }),
  vouchers: (companyId: string, when: When, currency: string) => ({ companyId, kind: "SPEND" as const, status: "POSTED" as const, spentAt: when, float: { currency } }),
  commission: (companyId: string, when: When, currency: string) => ({ companyId, currency, status: "PAID" as const, paidBankAccountId: { not: null }, paidAt: when }),
  tillPayouts: (companyId: string, when: When, currency: string) => ({ companyId, type: "PAYOUT" as const, currency, createdAt: when }),
  payroll: (companyId: string, when: When, currency: string) => ({ companyId, currency, status: "PAID" as const, paidAt: when }),
};
