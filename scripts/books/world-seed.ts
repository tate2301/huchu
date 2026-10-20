/**
 * Development only: a test workspace holding the Books design's world
 * (design/books/spec/world.json: Floorcode on Tue 6 Oct 2026), so every Books
 * screen can be checked with real data. It never touches the `floorcode`
 * workspace: everything goes into `books-world` ("Floorcode (test)").
 *
 *   pnpm exec tsx --env-file=.env scripts/books/world-seed.ts [--plan free|screens|advanced]
 *
 * The first run stands the workspace up (ENTERPRISE, CRM + Retail + Payroll),
 * its people, money accounts, customers, CRM companies and deals, quotes,
 * invoices, payments, a credit note, bills, a supplier payment, requisitions
 * and petty cash, all through the Books core the screens use; then the Bills &
 * spending and Bank & cash seeds for the same workspace; then each money
 * account's opening balance so its balance is the world's, posted as the
 * opening balances journal. A run that finds `books-world` only applies
 * `--plan` (default on the first run: screens).
 *
 * The test password is written to the scratchpad, never printed.
 * It refuses to run in production or against a database that is not local.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { createSalesCreditNote } from "@/lib/accounting/credit-notes";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { balances } from "@/lib/books/bank-accounts";
import { createPurchaseBill } from "@/lib/books/bill-create";
import type { BooksActor } from "@/lib/books/core";
import { recordBankEntry } from "@/lib/books/core/bank";
import { saveMoneyAccount } from "@/lib/books/core/money-accounts";
import { postOpeningBalances } from "@/lib/books/core/opening-balances";
import { setUpFloat, writeVoucher } from "@/lib/books/core/petty-cash";
import { postRequisitionAcquittal, postRequisitionDisbursement, sendRequisitionForApproval } from "@/lib/books/core/requisitions";
import { draftSupplierPayment, paySupplierPayment, submitSupplierPayment } from "@/lib/books/core/supplier-payments";
import { createBooksInvoice } from "@/lib/books/invoice-create";
import { readMoney, wentOut } from "@/lib/books/money";
import { recordBooksPayment } from "@/lib/books/payment-create";
import { draftInvoiceFromQuote, updateQuotation } from "@/lib/books/quotations";
import { createQuotationForLead } from "@/lib/crm/accounting-bridge";
import { decideCrmRequisition } from "@/lib/crm/requisition-decide";
import type { ReservableIdEntity } from "@/lib/id-generator";
import { syncEntitlementCatalog } from "@/lib/platform/entitlements";
import { provisionTenant } from "@/lib/platform/provision";
import { prisma } from "@/lib/prisma";

/* ── Safety ─────────────────────────────────────────────────────────────── */

if (process.env.NODE_ENV === "production") throw new Error("The world seed is for development only.");
for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  const value = process.env[name];
  if (!value) continue;
  const host = new URL(value).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") throw new Error(`${name} points at ${host}, not a local database. The world seed only runs locally.`);
}

// Nobody at books-world.test gets mail: notifications stay in the app (the child seeds' --env-file keeps an empty value).
process.env.RESEND_API_KEY = "";

const SLUG = "books-world";
const NAME = "Floorcode (test)";
const DOMAIN = "books-world.test";
const REPO = join(__dirname, "..", "..");
const CREDENTIALS = "/private/tmp/claude-501/-Users-user-work-huchu--claude-worktrees-corelith-books-design-polish-907835/70d8a328-2b37-4f65-8d45-7815a3d03ded/scratchpad/books-world-credentials.txt";

type Plan = "free" | "screens" | "advanced";
function readPlan(): Plan | null {
  const index = process.argv.findIndex((arg) => arg === "--plan" || arg.startsWith("--plan="));
  if (index === -1) return null;
  const arg = process.argv[index];
  const value = arg.includes("=") ? arg.split("=")[1] : process.argv[index + 1];
  if (value !== "free" && value !== "screens" && value !== "advanced") throw new Error("--plan is free, screens or advanced.");
  return value;
}

/* ── The clock ──────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
/** The world's today. */
const WORLD_TODAY = "2026-10-06";
const harareDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
/**
 * The one shift: every world date moves by the days between the world's today
 * and the day the seed runs, so overdue and due-this-week read as they do in
 * the world. (Run on 20 Oct 2026: 14 days.)
 */
const SHIFT_DAYS = Math.round((Date.parse(`${harareDay(new Date())}T00:00:00Z`) - Date.parse(`${WORLD_TODAY}T00:00:00Z`)) / DAY);
/** A world day ("2026-09-24") as the seeded day. */
const w = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + SHIFT_DAYS * DAY).toISOString().slice(0, 10);
/** A world day at a Harare hour. */
const wAt = (iso: string, hour = 9) => new Date(`${w(iso)}T${String(hour).padStart(2, "0")}:00:00.000+02:00`);

const ZWG_RATE = 26.8;
const VAT = 15.5;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** A line whose total, VAT included, is `gross` to the cent. */
const gross = (description: string, amount: number, taxRate = VAT) => ({ description, quantity: 1, unitPrice: amount / (1 + taxRate / 100), taxRate });

/* ── The plan ───────────────────────────────────────────────────────────── */

/**
 * The Books screens' flag, explicit either way so it outranks the plan.
 * `advanced` is the screens for now: `books.advanced` waits on the owner's
 * approval (lib/books/tiers.ts, BOOKS_ADVANCED_KEY); switch it here when it lands.
 */
async function applyPlan(companyId: string, plan: Plan) {
  let feature = await prisma.platformFeature.findUnique({ where: { key: "books.screens" }, select: { id: true } });
  if (!feature) {
    await syncEntitlementCatalog();
    feature = await prisma.platformFeature.findUniqueOrThrow({ where: { key: "books.screens" }, select: { id: true } });
  }
  const isEnabled = plan !== "free";
  const reason = `World seed: plan ${plan}`;
  await prisma.companyFeatureFlag.upsert({
    where: { companyId_featureId: { companyId, featureId: feature.id } },
    update: { isEnabled, reason, expiresAt: null },
    create: { companyId, featureId: feature.id, isEnabled, reason },
  });
  console.log(`${NAME}: plan ${plan} (books.screens ${isEnabled ? "on" : "off"}).`);
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** The next number a series gives is `next` (a world number), so the documents carry the world's numbers. */
async function nextIs(companyId: string, entityKey: ReservableIdEntity, next: number) {
  await prisma.idSequence.upsert({
    where: { companyId_entityKey_scopeKey: { companyId, entityKey, scopeKey: "GLOBAL" } },
    update: { lastNumber: next - 1 },
    create: { companyId, entityKey, scopeKey: "GLOBAL", lastNumber: next - 1 },
  });
}

async function moneySummary(companyId: string, label: string) {
  const view = await readMoney(prisma, companyId);
  const owed = view.finding.rest ?? "";
  const cameIn = view.sources.reduce((sum, source) => sum + source.amount, 0);
  console.log(`\n${label}`);
  console.log(`  ${view.finding.fact} ${owed}`);
  console.log(`  came in this month ${round2(cameIn).toFixed(2)} (${view.sources.map((s) => `${s.label} ${s.amount.toFixed(2)}`).join(", ") || "nothing"})`);
  const out = await wentOut(prisma, companyId, harareDay(new Date()), view.currency);
  console.log(`  went out this month ${out.amount.toFixed(2)} (${out.flows.map((flow) => `${flow.key} ${flow.amount.toFixed(2)} x${flow.count}`).join(", ") || "nothing"})`);
  console.log(`  bank total ${view.bank.total?.toFixed(2) ?? "no rate"}: ${view.bank.accounts.map((a) => `${a.name} ${a.currency} ${a.amount.toFixed(2)}`).join(", ")}`);
}

/* ── The world ──────────────────────────────────────────────────────────── */

const PEOPLE = [
  { name: "James Nyabadza", role: "SUPERADMIN" },
  { name: "Tonde Chuma", role: "MANAGER" },
  // The world has one manager; the Bills & spending seed needs two.
  { name: "Tendai Mlambo", role: "MANAGER" },
  { name: "Tsitsi Ndoro", role: "FINANCE_OFFICER" },
  { name: "Rudo Mapfumo", role: "SHOP_MANAGER" },
  { name: "Kuda Maposa", role: "SALES_REP" },
  { name: "Farai Dube", role: "SALES_REP" },
  { name: "Tinashe Moyo", role: "SALES_REP" },
] as const;
const emailOf = (name: string) => `${name.split(" ")[0].toLowerCase()}@${DOMAIN}`;

const CUSTOMERS = [
  { name: "Chisipite Dental", code: "C-0042", vat: "220419837", tin: "2001184522", crm: true, rep: "Kuda Maposa", phone: "+263 24 249 1180", address: "41 Harare Drive, Chisipite, Harare" },
  { name: "Highlands Guest Lodge", code: "C-0051", vat: "220733104", tin: "2000912377", crm: true, rep: "Farai Dube", phone: "+263 24 249 7712", address: "9 Kew Drive, Highlands, Harare" },
  { name: "Msasa Motors", code: "C-0058", vat: "220156920", tin: "2001477203", crm: true, rep: "Farai Dube", phone: "+263 24 248 6620", address: "117 Mutare Road, Msasa, Harare" },
  { name: "Pomona Offices", code: "C-0061", vat: "220881455", tin: "2001653018", crm: true, rep: "Kuda Maposa", phone: "+263 24 288 3304", address: "Pomona Business Park, Borrowdale Road, Harare" },
  { name: "Borrowdale Brooke Clinic", code: "C-0063", vat: "220519006", tin: "2001720446", crm: true, rep: "Tinashe Moyo", phone: "+263 24 287 0400", address: "Borrowdale Brooke, Harare" },
  { name: "Mrs T. Gumbo", code: "C-0064", vat: null, tin: null, crm: false, rep: null, phone: "+263 77 412 0981", address: "22 Ridgeway North, Highlands, Harare" },
  { name: "Greystone Park Primary", code: "C-0039", vat: null, tin: "2000338120", crm: true, rep: "Tinashe Moyo", phone: "+263 24 288 5512", address: "Greystone Park, Harare" },
  { name: "Avondale Fresh Mart", code: "C-0047", vat: "220670118", tin: "2001093345", crm: true, rep: "Kuda Maposa", phone: "+263 24 233 6018", address: "King George Road, Avondale, Harare" },
  { name: "Dr N. Sibanda", code: "C-0055", vat: null, tin: "2001288901", crm: false, rep: null, phone: "+263 77 233 9001", address: "6 Lomagundi Road, Avondale, Harare" },
] as const;
type CustomerName = (typeof CUSTOMERS)[number]["name"];

/** In number order: the world's invoices, and 0132 to 0134 so the series has no gap (0132 credited in full, 0133 and 0134 paid in mid-September). */
const INVOICES: Array<{ number: number; customer: CustomerName; issued: string; due: string; lines: ReturnType<typeof gross>[] }> = [
  { number: 131, customer: "Chisipite Dental", issued: "2026-09-10", due: "2026-09-24", lines: [gross("Vinyl plank, supplied and fitted, surgeries 1 and 2", 1240)] },
  { number: 132, customer: "Msasa Motors", issued: "2026-09-12", due: "2026-09-26", lines: [gross("Aluminium stair nosing, 12 lengths", 172.5)] },
  { number: 133, customer: "Highlands Guest Lodge", issued: "2026-09-12", due: "2026-09-26", lines: [gross("Carpet repair, room 4", 540)] },
  { number: 134, customer: "Dr N. Sibanda", issued: "2026-09-14", due: "2026-09-25", lines: [gross("Skirting replaced, study", 310)] },
  { number: 135, customer: "Highlands Guest Lodge", issued: "2026-09-17", due: "2026-10-01", lines: [gross("Carpet tiles, dining room", 860)] },
  { number: 136, customer: "Dr N. Sibanda", issued: "2026-09-18", due: "2026-09-29", lines: [gross("Oak strip flooring, lounge", 1130)] },
  { number: 137, customer: "Msasa Motors", issued: "2026-09-20", due: "2026-10-04", lines: [gross("Epoxy coating, service bay repair", 380)] },
  { number: 138, customer: "Avondale Fresh Mart", issued: "2026-09-21", due: "2026-09-30", lines: [gross("Anti-slip vinyl, cold room", 1865)] },
  { number: 139, customer: "Greystone Park Primary", issued: "2026-09-22", due: "2026-10-06", lines: [gross("Classroom floors, sheet vinyl, block B", 2980, 0)] },
  { number: 140, customer: "Borrowdale Brooke Clinic", issued: "2026-09-24", due: "2026-10-14", lines: [gross("Sheet vinyl, ward corridors", 1750)] },
  { number: 141, customer: "Mrs T. Gumbo", issued: "2026-09-25", due: "2026-10-05", lines: [gross("Bedroom carpets, supplied and fitted", 430)] },
  {
    number: 142,
    customer: "Pomona Offices",
    issued: "2026-09-28",
    due: "2026-10-20",
    lines: [gross("Carpet tiles, second floor", 1650), gross("Skirting, supplied and fitted", 344.22)],
  },
];

/** In the order they came in: REC-0091 to REC-0097. */
const RECEIPTS: Array<{ invoice: number; amount: number; on: string; account: string; reference: string }> = [
  { invoice: 133, amount: 540, on: "2026-09-15", account: "EcoCash merchant", reference: "EcoCash 0772 118 204" },
  { invoice: 134, amount: 310, on: "2026-09-16", account: "CBZ current", reference: "Card 4417" },
  { invoice: 136, amount: 1130, on: "2026-09-29", account: "CBZ current", reference: "Card 4417" },
  { invoice: 138, amount: 1865, on: "2026-09-30", account: "EcoCash merchant", reference: "EcoCash MP260930.1412" },
  { invoice: 139, amount: 2980, on: "2026-10-02", account: "CBZ current", reference: "GREYSTONE PARK PRIMARY" },
  { invoice: 141, amount: 430, on: "2026-10-05", account: "Showroom till float", reference: "Cash" },
  { invoice: 142, amount: 500, on: "2026-10-05", account: "CBZ current", reference: "POMONA OFFICES PART" },
];

const ACCOUNTS = [
  { name: "CBZ current", kind: "BANK", currency: "USD", balance: 10832.8, bankName: "CBZ", accountNumber: "0112004471", isDefault: true },
  { name: "CBZ ZWG", kind: "BANK", currency: "ZWG", balance: 12393.66, bankName: "CBZ", accountNumber: "0112004472" },
  { name: "EcoCash merchant", kind: "MOBILE", currency: "USD", balance: 612.4, bankName: "EcoCash", accountNumber: "0412" },
  { name: "Showroom till float", kind: "CASH", currency: "USD", balance: 180 },
  { name: "Showroom petty cash", kind: "CASH", currency: "USD", balance: 163.5 },
  { name: "Kuda's site cash", kind: "CASH", currency: "USD", balance: 120 },
] as const;

async function main() {
  const plan = readPlan();
  const existing = await prisma.company.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (existing) {
    console.log(`${NAME} (${SLUG}) is there already; only the plan changes.`);
    if (plan) await applyPlan(existing.id, plan);
    else console.log("No --plan given: nothing to do.");
    return;
  }
  console.log(`World dates move ${SHIFT_DAYS} days: the world's ${WORLD_TODAY} is ${w(WORLD_TODAY)}.`);

  /* ── The workspace and its people ── */
  const password = randomBytes(12).toString("base64url");
  const provisioned = await provisionTenant({
    name: NAME,
    slug: SLUG,
    tierCode: "ENTERPRISE",
    verticals: ["CRM", "RETAIL", "PAYROLL"],
    adminEmail: emailOf("James Nyabadza"),
    adminName: "James Nyabadza",
    adminPassword: password,
    actor: "scripts/books/world-seed.ts",
    reason: "Books design world, development only",
    onExistingSlug: "refuse",
  });
  for (const warning of provisioned.warnings) console.warn(`  ${warning}`);
  const companyId = provisioned.company.id;
  await applyPlan(companyId, plan ?? "screens");

  const hash = await bcrypt.hash(password, 12);
  const users = new Map<string, { id: string; name: string; role: string; email: string }>();
  for (const person of PEOPLE) {
    const email = emailOf(person.name);
    const row =
      person.role === "SUPERADMIN"
        ? await prisma.user.update({ where: { email }, data: { name: person.name }, select: { id: true, name: true, role: true, email: true } })
        : await prisma.user.create({ data: { companyId, email, name: person.name, role: person.role, password: hash, isActive: true }, select: { id: true, name: true, role: true, email: true } });
    users.set(person.name, { ...row, email: row.email ?? email });
  }
  mkdirSync(dirname(CREDENTIALS), { recursive: true });
  writeFileSync(
    CREDENTIALS,
    [`Workspace: ${NAME} (${SLUG}), development only`, `Password for every member: ${password}`, "", ...PEOPLE.map((person) => `${emailOf(person.name)}  ${person.role}`), ""].join("\n"),
    { mode: 0o600 },
  );
  const user = (name: (typeof PEOPLE)[number]["name"]) => users.get(name)!;
  const actor = (name: (typeof PEOPLE)[number]["name"]): BooksActor => ({ companyId, userId: user(name).id, role: user(name).role, grants: new Set() });
  const session = (name: (typeof PEOPLE)[number]["name"]) => ({ user: { id: user(name).id, role: user(name).role, companyId, name, email: user(name).email } }) as unknown as AuthenticatedSession;
  const james = actor("James Nyabadza");
  const tonde = actor("Tonde Chuma");
  const tsitsi = actor("Tsitsi Ndoro");
  const rudo = actor("Rudo Mapfumo");

  /* ── Rates: RBZ's today and at the end of September ── */
  for (const day of [w(WORLD_TODAY), w("2026-09-30")]) {
    await prisma.currencyRate.create({ data: { companyId, baseCurrency: "USD", quoteCurrency: "ZWG", rate: ZWG_RATE, effectiveDate: new Date(`${day}T00:00:00.000Z`), source: "RBZ", createdAt: new Date(`${day}T06:00:00.000+02:00`) } });
  }

  /* ── Money accounts: the bank account provisioning made becomes CBZ current, the first ── */
  const provisionedBank = await prisma.bankAccount.findFirst({ where: { companyId, kind: "BANK", currency: "USD" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const accounts = new Map<string, string>();
  for (const account of ACCOUNTS) {
    const saved = await saveMoneyAccount(james, account.name === "CBZ current" ? (provisionedBank?.id ?? null) : null, {
      name: account.name,
      kind: account.kind,
      currency: account.currency,
      bankName: "bankName" in account ? account.bankName : null,
      accountNumber: "accountNumber" in account ? account.accountNumber : null,
      showOnDocuments: account.kind !== "CASH",
      isDefault: "isDefault" in account ? account.isDefault : undefined,
      openingBalance: 0,
    });
    accounts.set(account.name, saved.id);
  }
  const accountId = (name: string) => accounts.get(name)!;
  await setUpFloat(james, { bankAccountId: accountId("Showroom petty cash"), holderId: user("Rudo Mapfumo").id, imprestAmount: 200 });

  /* ── Tax codes ── */
  const taxCodes = await prisma.taxCode.findMany({ where: { companyId, code: { in: ["VAT15_5", "EXEMPT"] } }, select: { id: true, code: true } });
  const vatCode = taxCodes.find((code) => code.code === "VAT15_5")?.id;
  const exemptCode = taxCodes.find((code) => code.code === "EXEMPT")?.id;
  const withCode = <T extends { taxRate: number }>(line: T) => ({ ...line, taxCodeId: (line.taxRate > 0 ? vatCode : exemptCode) ?? undefined });

  /* ── Customers, and the companies and deals in the CRM ── */
  const customers = new Map<string, string>();
  const clients = new Map<string, string>();
  const pipeline = await prisma.crmPipeline.create({ data: { companyId, name: "Jobs", isDefault: true, position: 0 }, select: { id: true } });
  const stages: Record<string, { id: string; status: "OPEN" | "WON" | "LOST" }> = {};
  for (const [position, stage] of ["Enquiry", "Site measure", "Quoted", "Won", "Lost"].entries()) {
    const status = stage === "Won" ? "WON" : stage === "Lost" ? "LOST" : "OPEN";
    const row = await prisma.crmPipelineStage.create({ data: { companyId, pipelineId: pipeline.id, name: stage, position, probability: [10, 30, 55, 100, 0][position], status }, select: { id: true } });
    stages[stage] = { id: row.id, status };
  }
  let clientNo = 0;
  for (const entry of CUSTOMERS) {
    const customer = await prisma.customer.create({
      data: { companyId, name: entry.name, code: entry.code, vatNumber: entry.vat, taxNumber: entry.tin, phone: entry.phone, address: entry.address, isActive: true },
      select: { id: true },
    });
    customers.set(entry.name, customer.id);
    if (!entry.crm) continue;
    clientNo += 1;
    const client = await prisma.crmClient.create({
      data: { companyId, clientNo: `CRMC-${String(clientNo).padStart(4, "0")}`, name: entry.name, customerId: customer.id, city: "Harare", country: "Zimbabwe", phone: entry.phone, assignedToId: entry.rep ? user(entry.rep).id : null },
      select: { id: true },
    });
    clients.set(entry.name, client.id);
  }
  const DEALS: Array<{ client: CustomerName; title: string; value: number; stage: string; won?: string }> = [
    { client: "Chisipite Dental", title: "Surgeries, vinyl plank", value: 1240, stage: "Won", won: "2026-09-03" },
    { client: "Highlands Guest Lodge", title: "Dining room, carpet tiles", value: 860, stage: "Won", won: "2026-09-11" },
    { client: "Msasa Motors", title: "Service bay, epoxy repair", value: 380, stage: "Won", won: "2026-09-15" },
    { client: "Msasa Motors", title: "Showroom floor, sanded and sealed", value: 3150, stage: "Quoted" },
    { client: "Pomona Offices", title: "Second floor, carpet tiles and skirting", value: 1994.22, stage: "Won", won: "2026-09-22" },
    { client: "Borrowdale Brooke Clinic", title: "Ward corridors, sheet vinyl", value: 1750, stage: "Won", won: "2026-09-18" },
    { client: "Borrowdale Brooke Clinic", title: "Theatre wing, sheet vinyl", value: 6400, stage: "Won", won: "2026-10-05" },
    { client: "Greystone Park Primary", title: "Block B classrooms", value: 2980, stage: "Won", won: "2026-09-14" },
    { client: "Highlands Guest Lodge", title: "Guest rooms 5 to 9, carpets", value: 2240, stage: "Quoted" },
    { client: "Avondale Fresh Mart", title: "Cold room, anti-slip vinyl", value: 1865, stage: "Won", won: "2026-09-16" },
  ];
  const deals: string[] = [];
  for (const [index, deal] of DEALS.entries()) {
    const stage = stages[deal.stage];
    const rep = CUSTOMERS.find((entry) => entry.name === deal.client)?.rep ?? null;
    const row = await prisma.crmDeal.create({
      data: {
        companyId,
        dealNo: `DEAL-${String(index + 1).padStart(4, "0")}`,
        title: deal.title,
        pipelineId: pipeline.id,
        stageId: stage.id,
        status: stage.status,
        value: deal.value,
        currency: "USD",
        clientId: clients.get(deal.client)!,
        assignedToId: rep ? user(rep).id : null,
        stageEnteredAt: deal.won ? wAt(deal.won) : wAt("2026-10-01"),
        wonAt: deal.won ? wAt(deal.won, 15) : null,
        expectedCloseDate: deal.won ? wAt(deal.won) : wAt("2026-10-20"),
      },
      select: { id: true },
    });
    deals.push(row.id);
  }

  /* ── Quotes: QTN-0216 and 0217 sent, QTN-0218 accepted, and Vane's draft invoice from it ── */
  await nextIs(companyId, "SALES_QUOTATION", 216);
  const quote = (dealIndex: number, lines: ReturnType<typeof gross>[]) =>
    createQuotationForLead({ dealId: deals[dealIndex], companyId, userId: user("Tonde Chuma").id, lines, validUntil: wAt("2026-10-31") });
  await quote(3, [gross("Showroom floor, sanded and sealed, 210 m²", 3150)]);
  await quote(8, [gross("Carpet, guest rooms 5 to 9, supplied and fitted", 2240)]);
  const q218 = await quote(6, [gross("Sheet vinyl, theatre wing, supplied and fitted", 5480), gross("Coved skirting and welding", 920)]);
  const q218Row = { id: q218.quotationId };
  await updateQuotation({ companyId, userId: user("Tonde Chuma").id }, q218Row.id, { status: "ACCEPTED" });
  await draftInvoiceFromQuote({ companyId, userId: null, madeByVane: true }, { quotationId: q218Row.id, invoiceDate: w(WORLD_TODAY), dueDate: w("2026-11-05") });

  /* ── Invoices, issued in number order on their world dates ── */
  const invoices = new Map<number, string>();
  for (const invoice of INVOICES) {
    await nextIs(companyId, "SALES_INVOICE", invoice.number);
    const made = await createBooksInvoice(james, {
      customerId: customers.get(invoice.customer)!,
      invoiceDate: w(invoice.issued),
      dueDate: w(invoice.due),
      currency: "USD",
      issueNow: true,
      lines: invoice.lines.map(withCode),
    });
    invoices.set(invoice.number, made.id);
  }

  /* ── INV-0132 credited in full: the nosing came back unused ── */
  await createSalesCreditNote(
    { companyId, userId: user("Tsitsi Ndoro").id },
    { invoiceId: invoices.get(132)!, noteDate: w("2026-09-16"), currency: "USD", reason: "Stair nosing returned unused", issueNow: true, lines: [withCode(gross("Aluminium stair nosing, 12 lengths, returned", 172.5))] },
  );

  /* ── Payments received: REC-0091 to REC-0097 ── */
  await nextIs(companyId, "SALES_RECEIPT", 91);
  for (const receipt of RECEIPTS) {
    const invoice = INVOICES.find((row) => row.number === receipt.invoice)!;
    await recordBooksPayment(tsitsi, {
      customerId: customers.get(invoice.customer)!,
      bankAccountId: accountId(receipt.account),
      receivedAt: w(receipt.on),
      currency: "USD",
      amount: receipt.amount,
      reference: receipt.reference,
      allocations: [{ invoiceId: invoices.get(receipt.invoice)!, amount: receipt.amount }],
    });
  }

  /* ── Money moved between accounts: EcoCash swept to the bank, the till's cash banked ── */
  await recordBankEntry(tsitsi, { kind: "TRANSFER", bankAccountId: accountId("EcoCash merchant"), toBankAccountId: accountId("CBZ current"), date: wAt("2026-10-01", 10), amount: 1800, reference: "ECO 0412 SWEEP", description: "EcoCash to CBZ" });
  await recordBankEntry(tsitsi, { kind: "TRANSFER", bankAccountId: accountId("Showroom till float"), toBankAccountId: accountId("CBZ current"), date: wAt("2026-10-06", 8), amount: 430, reference: "CASH DEPOSIT", description: "Cash banked, showroom" });

  /* ── Suppliers and bills: BILL-0084 to 0087 recorded, Belvedere's waiting for the owner ── */
  const vendor = (name: string, extra: Partial<Prisma.VendorUncheckedCreateInput>) =>
    prisma.vendor.create({ data: { companyId, name, itf263Number: extra.itf263Number ?? null, itf263ExpiresAt: new Date("2027-06-30T00:00:00.000Z"), ...extra } });
  const tileTrim = await vendor("Tile & Trim Supplies", { contactName: "Mr K. Mhlanga", phone: "+263 24 262 1180", address: "8 Lytton Road, Workington, Harare", vatNumber: "220301447", taxNumber: "2000519920", payTermsDays: 21, itf263Number: "0102-44310" });
  const zesa = await vendor("ZESA account 41187", { phone: "+263 24 277 4508", address: "Electricity Centre, Samora Machel Ave, Harare", vatNumber: "220000123", payTermsDays: 14, itf263Number: "0001-00012" });
  const halsted = await vendor("Halsted Builders", { phone: "+263 24 249 0000", address: "Willowvale, Harare", vatNumber: "220011456", payTermsDays: 14, itf263Number: "0044-19020" });
  const belvedere = await vendor("Belvedere Rentals", { contactName: "Mrs A. Pillay", phone: "+263 24 279 3310", address: "14 Bishop Gaul Ave, Belvedere, Harare", vatNumber: "220488102", payTermsDays: 7, itf263Number: "0071-30022" });
  await nextIs(companyId, "PURCHASE_BILL", 84);
  const bill = (vendorId: string, billDate: string, dueDate: string, fti: string, lines: ReturnType<typeof gross>[]) =>
    createPurchaseBill(james, { vendorId, billDate: w(billDate), dueDate: w(dueDate), currency: "USD", receiveNow: true, supplierFtiNumber: fti, fdmsStatus: "VALID", lines: lines.map(withCode) });
  const b84 = await bill(tileTrim.id, "2026-09-15", "2026-09-30", "FTI 0002-00080391", [gross("Porcelain tiles, 60 × 60, 80 m²", 1860)]);
  const b85 = await bill(zesa.id, "2026-09-18", "2026-10-02", "FTI 0009-00412008", [gross("Electricity, showroom, August", 214.6)]);
  await bill(halsted.id, "2026-09-25", "2026-10-09", "FTI 0003-00019220", [gross("Screed, 40 kg, 44 bags", 312.4)]);
  await bill(tileTrim.id, "2026-09-29", "2026-10-20", "FTI 0002-00081154", [gross("Ceramic skirting and trims", 2410)]);
  await createPurchaseBill(tonde, { vendorId: belvedere.id, billDate: w("2026-10-01"), dueDate: w("2026-10-07"), currency: "USD", receiveNow: false, supplierFtiNumber: "FTI 0001-00004417", fdmsStatus: "NOT_CHECKED", lines: [withCode(gross("Showroom rent, October", 1200))] });

  /* ── Supplier payments: ZESA at the end of September, Tile & Trim on 1 October ── */
  const pay = async (vendorId: string, billId: string, amount: number, on: string, reference: string) => {
    const draft = await draftSupplierPayment(james, { vendorId, billId, bankAccountId: accountId("CBZ current"), amount, paidAt: w(on), reference });
    await submitSupplierPayment(james, draft.id, wAt(on, 9));
    await paySupplierPayment(james, draft.id, wAt(on, 10));
  };
  await pay(zesa.id, b85.id, 214.6, "2026-09-30", "ZESA 41187");
  await pay(tileTrim.id, b84.id, 1860, "2026-10-01", "FLOORCODE BILL-0084");

  /* ── Requisitions from the CRM: REQ-0038 to REQ-0043 ── */
  await nextIs(companyId, "CRM_REQUISITION", 38);
  type Category = "FUEL" | "MATERIALS" | "TRANSPORT" | "EQUIPMENT" | "OTHER";
  const ask = async (by: (typeof PEOPLE)[number]["name"], purpose: string, category: Category, amount: number, forWhom: string, on: string) => {
    const row = await prisma.crmRequisition.create({ data: { companyId, notes: `For ${forWhom}`, status: "DRAFT", category, purpose, amount, currency: "USD", requestedById: user(by).id, neededBy: new Date(`${w(on)}T00:00:00.000Z`), createdAt: wAt(on, 8) } });
    return prisma.$transaction(async (tx) => {
      const sent = await sendRequisitionForApproval(tx, { companyId, id: row.id, requisitionNo: null, amount, actorId: user(by).id, at: wAt(on, 8) });
      return tx.crmRequisition.update({ where: { id: row.id }, data: { status: "SUBMITTED", submittedAt: wAt(on, 8), requisitionNo: sent.requisitionNo, approvalLimit: sent.approvalLimit, approverId: sent.approverId } });
    });
  };
  const disburse = async (id: string, amount: number, on: string) => {
    await decideCrmRequisition(session("Tonde Chuma"), id, { approve: true }, wAt(on, 8));
    const paidOut = await prisma.crmRequisition.update({ where: { id }, data: { status: "DISBURSED", disbursedById: user("Tsitsi Ndoro").id, disbursedAt: wAt(on, 9), bankAccountId: accountId("EcoCash merchant"), paidAmount: amount, payoutMethod: "ECOCASH" } });
    await postRequisitionDisbursement(prisma, paidOut, { userId: user("Tsitsi Ndoro").id, role: user("Tsitsi Ndoro").role });
  };
  const acquit = async (id: string, by: (typeof PEOPLE)[number]["name"], spends: Array<[string, Category, number]>, on: string) => {
    const log = await prisma.crmDailyLog.create({ data: { companyId, userId: user(by).id, logDate: new Date(`${w(on)}T00:00:00.000Z`), submittedAt: wAt(on, 16) } });
    for (const [description, category, amount] of spends) {
      await prisma.crmDailyCostEntry.create({ data: { companyId, logId: log.id, direction: "SPENT", category, amount, currency: "USD", description, requisitionId: id, receiptUrl: "/demo/receipts/fuel-receipt.png", createdAt: wAt(on, 15) } });
    }
    const spent = spends.reduce((sum, [, , amount]) => sum + amount, 0);
    const done = await prisma.crmRequisition.update({ where: { id }, data: { status: "ACQUITTED", acquittedAt: wAt(on, 16), acquittedById: user("Tonde Chuma").id, acquittedAmount: spent, changeAmount: 0 } });
    await postRequisitionAcquittal(prisma, done, { spend: spends.map(([, category, amount]) => ({ category, amount })), change: new Prisma.Decimal(0), changeAccountId: null, actor: { userId: user("Tonde Chuma").id, role: user("Tonde Chuma").role } });
  };
  const r38 = await ask("Farai Dube", "Diesel for the bakkie", "FUEL", 60, "Highlands Guest Lodge", "2026-09-09");
  await disburse(r38.id, 60, "2026-09-10");
  await acquit(r38.id, "Farai Dube", [["Diesel, 34 litres, Total Highlands", "FUEL", 60]], "2026-09-12");
  const r39 = await ask("Tinashe Moyo", "Tile cutter blades", "EQUIPMENT", 45, "the workshop", "2026-09-11");
  await decideCrmRequisition(session("Tonde Chuma"), r39.id, { approve: false, decisionNote: "We have two new blades in the store." }, wAt("2026-09-11", 11));
  const r40 = await ask("Rudo Mapfumo", "Cleaning supplies", "OTHER", 35, "the showroom", "2026-09-14");
  await disburse(r40.id, 35, "2026-09-15");
  await acquit(r40.id, "Rudo Mapfumo", [["Cleaning supplies, OK Mart", "OTHER", 35]], "2026-09-16");
  const r41 = await ask("Kuda Maposa", "Site materials, Pomona", "MATERIALS", 150, "Pomona Offices", "2026-10-01");
  await disburse(r41.id, 150, "2026-10-02");
  await ask("Tinashe Moyo", "Skirting cut and delivery", "TRANSPORT", 85, "Pomona Offices", "2026-10-05");
  await ask("Farai Dube", "Floor sander hire, 2 days", "EQUIPMENT", 240, "Msasa Motors", "2026-10-06");

  /* ── Petty cash: four vouchers from the showroom float, Rudo's ── */
  const vouchers: Array<[Category, string, number, string]> = [
    ["OTHER", "Milk and tea, showroom", 6, "2026-10-01"],
    ["TRANSPORT", "Kombi fares, sample delivery to Pomona", 8.5, "2026-10-02"],
    ["OTHER", "Cleaning cloths and bleach", 12, "2026-10-05"],
    ["MATERIALS", "Masking tape, 4 rolls", 10, "2026-10-06"],
  ];
  for (const [category, description, amount, on] of vouchers) {
    await writeVoucher(rudo, { floatId: accountId("Showroom petty cash"), category, description, amount, taxAmount: 0, fdmsStatus: "NOT_CHECKED", spentAt: w(on) }, wAt(on, 11));
  }

  await moneySummary(companyId, "Money, the world's records only:");

  /* ── The Bills & spending seed for this workspace ── */
  const seed = (file: string) => execFileSync("pnpm", ["exec", "tsx", "--env-file=.env", `scripts/books/${file}`, SLUG], { cwd: REPO, stdio: "inherit" });
  seed("bills-spending-seed.ts");

  /* ── Opening balances: each account's balance is the world's, posted as the opening journal ── */
  const rows = await prisma.bankAccount.findMany({ where: { companyId }, select: { id: true, name: true, kind: true, currency: true, openingBalance: true, ledgerAccountId: true } });
  const moved = await balances(prisma, companyId, rows.map((row) => row.id));
  const ledgerOf = async (row: (typeof rows)[number]) => row.ledgerAccountId ?? (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId, code: { BANK: "1010", MOBILE: "1016", CASH: "1005" }[row.kind] }, select: { id: true } })).id;
  const byLedger = new Map<string, number>();
  for (const row of rows) {
    const target = ACCOUNTS.find((account) => account.name === row.name)?.balance;
    const opening = target === undefined ? row.openingBalance : round2(target - (moved.get(row.id) ?? 0));
    if (opening !== row.openingBalance) await prisma.bankAccount.update({ where: { id: row.id }, data: { openingBalance: opening } });
    const usd = row.currency === "ZWG" ? opening / ZWG_RATE : opening;
    const ledger = await ledgerOf(row);
    byLedger.set(ledger, round2((byLedger.get(ledger) ?? 0) + usd));
  }
  const equity = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId, code: "3100" }, select: { id: true } });
  const lines = [...byLedger.entries()].map(([id, amount]) => ({ accountId: id, debit: Math.max(0, amount), credit: Math.max(0, -amount) }));
  const net = round2(lines.reduce((sum, line) => sum + line.debit - line.credit, 0));
  lines.push({ accountId: equity.id, debit: Math.max(0, -net), credit: Math.max(0, net) });
  await postOpeningBalances(james, { date: w("2026-08-31"), lines, sourceReference: "World seed" });

  /* ── The Bank & cash and Tax seed for this workspace ── */
  seed("bank-tax-seed.ts");

  await moneySummary(companyId, "Money, with the Bills & spending and Bank & cash seeds:");
  console.log(`\n${NAME} (${SLUG}) is ready. Members and the test password: ${CREDENTIALS}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
