/**
 * Development only: a workspace's Bank & cash and Tax as the Books boards draw
 * them (books_pages_b.py: CBZ current in US dollars and in ZiG, the EcoCash
 * merchant wallet, a week of statement lines with an IMTT charge, a transfer
 * from EcoCash and CBZ's fee; RBZ's ZiG rates and one typed in; Mutare Timber
 * Works' ITF263 run out on 30 June; the year's provisional tax estimate; a
 * fiscal day with its signed documents and one that failed), written through
 * the Books core the way the screens write them, for checking the P3b pages
 * against their boards.
 *
 *   pnpm exec tsx --env-file=.env scripts/books/bank-tax-seed.ts [workspace-slug]   (default: floorcode)
 *
 * It runs once: a workspace that already has "CBZ current, ZWG" is left alone.
 * The fiscal device it adds is switched off, so nothing is ever sent from it.
 * It refuses to run in production.
 */
import { uploadStatement } from "@/lib/books/bank";
import type { BooksActor } from "@/lib/books/core";
import { startReconciliation } from "@/lib/books/core/bank";
import { saveTaxSettings } from "@/lib/books/core/tax-settings";
import { prisma } from "@/lib/prisma";

if (process.env.NODE_ENV === "production") throw new Error("The Bank & cash seed is for development only.");

const slug = process.argv[2] ?? "floorcode";
const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const at = (iso: string, hour = 6, minute = 0) => new Date(`${iso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000+02:00`);

async function main() {
  const company = await prisma.company.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!company) throw new Error(`There is no workspace ${slug}.`);
  const companyId = company.id;
  if (await prisma.bankAccount.findFirst({ where: { companyId, name: "CBZ current, ZWG" }, select: { id: true } })) {
    console.log(`${company.name} has its Bank & cash already.`);
    return;
  }
  const users = await prisma.user.findMany({ where: { companyId }, select: { id: true, name: true, role: true }, orderBy: { createdAt: "asc" } });
  const owner = users.find((user) => user.role === "SUPERADMIN");
  const managers = users.filter((user) => user.role === "MANAGER");
  if (!owner) throw new Error("It needs an owner.");
  const actor: BooksActor = { companyId, userId: owner.id, role: owner.role, grants: new Set() };
  const typist = managers[1] ?? managers[0] ?? owner;

  // Accounts: CBZ's account number where it has none, its ZiG account, the EcoCash merchant wallet.
  const cbz = await prisma.bankAccount.findFirst({ where: { companyId, name: "CBZ current", currency: "USD" }, select: { id: true, accountNumber: true } });
  if (!cbz) throw new Error("It needs the CBZ current account the Sales seed made.");
  if (!cbz.accountNumber) await prisma.bankAccount.update({ where: { id: cbz.id }, data: { accountNumber: "0112004471" } });
  const zig = await prisma.bankAccount.create({ data: { companyId, name: "CBZ current, ZWG", bankName: "CBZ", accountNumber: "0112004472", currency: "ZWG", openingBalance: 61_280.4, kind: "BANK" } });
  const ecocash = await prisma.bankAccount.create({ data: { companyId, name: "EcoCash merchant", bankName: "EcoCash", accountNumber: "0412", currency: "USD", openingBalance: 1_086.5, kind: "MOBILE" } });

  // RBZ's ZiG rates for the fortnight, one typed in on a day the feed was down, and the month end.
  const lastMonthEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 0)).toISOString().slice(0, 10);
  const rates: Array<{ date: string; rate: number; manual?: boolean }> = [
    { date: lastMonthEnd, rate: 26.8 },
    ...Array.from({ length: 12 }, (_, index) => ({ date: day(-index), rate: [27.0, 26.99, 26.98, 26.98, 27.0, 26.96, 26.95, 26.95, 26.94, 26.93, 26.92, 26.9][index], manual: index === 6 })),
  ];
  for (const row of rates) {
    const exists = await prisma.currencyRate.findFirst({ where: { companyId, quoteCurrency: "ZWG", effectiveDate: new Date(`${row.date}T00:00:00.000Z`) }, select: { id: true } });
    if (exists) continue;
    await prisma.currencyRate.create({
      data: {
        companyId,
        baseCurrency: "USD",
        quoteCurrency: "ZWG",
        rate: row.rate,
        effectiveDate: new Date(`${row.date}T00:00:00.000Z`),
        source: row.manual ? "MANUAL" : "RBZ",
        createdById: row.manual ? typist.id : null,
        createdAt: row.manual ? at(row.date, 9, 12) : at(row.date),
      },
    });
  }

  // A week of CBZ's statement: the IMTT on a payment, a transfer in from EcoCash, CBZ's monthly fee.
  await uploadStatement(prisma, {
    companyId,
    userId: owner.id,
    accountId: cbz.id,
    rows: [
      { date: day(-4), description: "IMTT 2% tax", reference: "IMTT", amount: 23.69, direction: "DEBIT" },
      { date: day(-2), description: "Transfer from EcoCash 0412", reference: "ECO 0412", amount: 800, direction: "CREDIT" },
      { date: day(-2), description: "Service fee October", reference: null, amount: 18, direction: "DEBIT" },
    ],
  });
  // CBZ USD against its statement to the day before yesterday; CBZ ZiG against a statement that agrees.
  const cbzBook = await prisma.bankTransaction.findMany({ where: { companyId, bankAccountId: cbz.id }, select: { amount: true, direction: true } });
  const cbzOpening = (await prisma.bankAccount.findUniqueOrThrow({ where: { id: cbz.id }, select: { openingBalance: true } })).openingBalance;
  const book = cbzOpening + cbzBook.reduce((sum, row) => sum + (row.direction === "CREDIT" ? row.amount : -row.amount), 0);
  await startReconciliation(actor, { bankAccountId: cbz.id, statementEndDate: new Date(`${day(-2)}T00:00:00.000Z`), statementBalance: Math.round((book + 758.31) * 100) / 100 });
  await startReconciliation(actor, { bankAccountId: zig.id, statementEndDate: new Date(`${day(-2)}T00:00:00.000Z`), statementBalance: 61_280.4 });

  // Tax clearances: Mutare Timber Works' ran out on 30 June; Tile Trader's and Carpet Mills' are good.
  const itf = [
    { name: "Mutare Timber Works", number: "0041-77213", expires: "2026-06-30" },
    { name: "Tile Trader Zimbabwe", number: "0077-11820", expires: "2026-12-31" },
    { name: "Carpet Mills Africa", number: "0090-55102", expires: "2027-06-30" },
  ];
  for (const row of itf) await prisma.vendor.updateMany({ where: { companyId, name: row.name, itf263Number: null }, data: { itf263Number: row.number, itf263ExpiresAt: new Date(`${row.expires}T00:00:00.000Z`) } });

  // The year's provisional tax estimate, as James revised it.
  const year = new Date().getUTCFullYear();
  await saveTaxSettings(companyId, { provisional: { estimates: { [String(year)]: { taxUsd: 8_750, incomeUsd: 35_000, split5050: false, foreignShare: null, revisedAt: at(day(-30), 10).toISOString(), revisedBy: owner.name } } } });

  // A fiscal day with its signed documents and one that failed. The device is switched off: nothing is sent.
  const invoices = await prisma.salesInvoice.findMany({ where: { companyId, status: { in: ["ISSUED", "PAID"] }, fiscalReceipt: null }, orderBy: { invoiceDate: "asc" }, select: { id: true, invoiceNumber: true, currency: true, invoiceDate: true }, take: 8 });
  if (invoices.length) {
    const config = await prisma.fiscalisationProviderConfig.upsert({
      where: { companyId_providerKey: { companyId, providerKey: "zimra-fdms" } },
      update: {},
      create: { companyId, providerKey: "zimra-fdms", deviceId: "21544", serialNumber: "FLC-POS-01", isActive: false, registeredAt: at(day(-120), 9), registeredById: owner.id },
    });
    const fiscalDay = await prisma.fiscalDay.create({ data: { companyId, providerConfigId: config.id, deviceId: "21544", fiscalDayNo: 124, status: "OPENED", openedAt: at(day(-1), 7, 30), lastReceiptCounter: invoices.length - 1, lastReceiptGlobalNo: 1511 } });
    const code = (seed: number) => [0, 1, 2, 3].map((part) => ((seed * 7919 + part * 104729) % 65536).toString(16).toUpperCase().padStart(4, "0")).join("-");
    for (const [index, invoice] of invoices.entries()) {
      const failed = index === invoices.length - 1;
      await prisma.fiscalReceipt.create({
        data: {
          companyId,
          invoiceId: invoice.id,
          fiscalDayId: failed ? null : fiscalDay.id,
          receiptType: "FISCALINVOICE",
          receiptCurrency: invoice.currency,
          receiptNumber: invoice.invoiceNumber,
          status: failed ? "FAILED" : "SUCCESS",
          fiscalNumber: failed ? null : code(index + 3),
          receiptCounter: failed ? null : index + 1,
          receiptGlobalNo: failed ? null : 1504 + index,
          issuedAt: failed ? null : at(day(-1), 9 + index),
          attemptCount: failed ? 7 : 1,
          lastError: failed ? "FDMS did not answer: the device is offline." : null,
          createdAt: at(day(-1), 9 + index),
        },
      });
      if (failed) await prisma.salesInvoice.update({ where: { id: invoice.id }, data: { fiscalStatus: "FAILED" } });
    }
  }

  console.log(`${company.name}: ${zig.id} and ${ecocash.id} added, ${rates.length} rates, 3 statement lines, 2 reconciliations, ${itf.length} ITF263s, the ${year} estimate, ${invoices.length} fiscal documents.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
