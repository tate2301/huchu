import { Prisma, type AccountingSourceType, type AccountType, type RetailAccountRole, type RetailPostingSchedule, type RetailPostingTrigger } from "@prisma/client";

import type { AccountingSeedPackResult } from "@/lib/accounting/bootstrap";
import { getZimbabweRetailFoundationPack } from "@/lib/accounting/defaults";
import { postIntegrationEvent } from "@/lib/accounting/integration";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { loadPaymentSettings } from "@/lib/retail/payment-settings";
import { TENDER_OPTIONS, tenderKeyOf, type TenderKey } from "@/lib/retail/payment-words";
import { DEFAULT_POSTING_SCHEDULE, retailPostingSchedule } from "@/lib/retail/posting-schedule";
import {
  accountLabel,
  parseQuickAccount,
  runParts,
  ROLE_OPTIONS,
  ROLE_TYPES,
  TENDER_TYPES,
  TYPE_WORDS,
  VOUCHER_TYPES,
  wrongTypeProblem,
  type RunCounts,
} from "@/lib/retail/posting-words";

/**
 * Posting to the books (SET-09, W-65, board PostingSettings): the account each
 * tender settles into (`TenderAccountMapping`, company level), the account
 * each role posts to (`RetailAccountRoleMapping`), when sales post
 * (`RetailPostingSettings`), and the posting run that "Post now" and the
 * 23:00 job start (`RetailPostingRun`).
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type AccountOption = { id: string; label: string; sub: string };

/** An account as an account field lists it: "1010 Cash on hand, US$" over "Asset". */
export function accountOption(account: { id: string; code: string; name: string; type: AccountType }): AccountOption {
  return { id: account.id, label: accountLabel(account), sub: TYPE_WORDS[account.type] };
}

/** Every account a line can post to: active, a ledger (not a heading), in code order. */
export async function postableAccounts(companyId: string, db: Db = prisma) {
  return db.chartOfAccount.findMany({
    where: { companyId, isActive: true, nodeType: "LEDGER" },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });
}

/** The company-level mapping a tender's row reads and writes: cash by its currency. */
function tenderWhere(companyId: string, key: TenderKey) {
  const option = TENDER_OPTIONS.find((entry) => entry.key === key)!;
  return {
    companyId,
    tenderType: option.tender,
    siteId: null,
    registerCode: null,
    currency: option.currency,
  };
}

export type PostingState = {
  tenders: Array<{ key: TenderKey; label: string; on: boolean; account: AccountOption | null }>;
  roles: Array<{ role: RetailAccountRole; field: string; label: string; shown: boolean; account: AccountOption | null }>;
  schedule: RetailPostingSchedule;
  lastRun: (RunCounts & { at: Date; failed: number }) | null;
  checks: Array<{ ok: boolean; text: string }>;
};

export async function loadPostingState(companyId: string): Promise<PostingState> {
  const [payments, mappings, roleMappings, schedule, lastRun, profile, settings] = await Promise.all([
    loadPaymentSettings(companyId),
    prisma.tenderAccountMapping.findMany({
      where: { companyId, siteId: null, registerCode: null, isActive: true },
      include: { clearingAccount: { select: { id: true, code: true, name: true, type: true, isActive: true, nodeType: true } } },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    prisma.retailAccountRoleMapping.findMany({
      where: { companyId },
      include: { account: { select: { id: true, code: true, name: true, type: true } } },
    }),
    retailPostingSchedule(companyId),
    prisma.retailPostingRun.findFirst({
      where: { companyId, finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.retailShopProfile.findUnique({
      where: { companyId },
      select: { businessType: true, vatRegistered: true, emptiesAndDeposits: true },
    }),
    prisma.accountingSettings.findUnique({
      where: { companyId },
      select: { defaultTaxCode: { select: { rate: true } } },
    }),
  ]);

  const tenders = TENDER_OPTIONS.map((option) => {
    // As posting resolves it: the tender's own currency first, else a mapping for any currency.
    const mapping =
      mappings.find((row) => row.tenderType === option.tender && (row.currency ?? null) === option.currency) ??
      mappings.find((row) => row.tenderType === option.tender && row.currency === null);
    const account =
      mapping && mapping.clearingAccount.isActive && mapping.clearingAccount.nodeType === "LEDGER"
        ? accountOption(mapping.clearingAccount)
        : null;
    return { key: option.key, label: option.label, on: payments.tenders[option.key], account };
  });

  const vatRegistered = profile?.vatRegistered ?? true;
  const deposits = profile?.businessType === "LIQUOR" && profile.emptiesAndDeposits;
  const roles = ROLE_OPTIONS.map((option) => {
    const mapping = roleMappings.find((row) => row.role === option.role);
    const shown = option.role === "VAT_OUTPUT" ? vatRegistered : option.role === "DEPOSITS_HELD" ? Boolean(deposits) : true;
    return { ...option, shown, account: mapping ? accountOption(mapping.account) : null };
  });

  // "Ready to post": the three facts a posting run depends on.
  const missing = tenders.filter((tender) => tender.on && !tender.account).map((tender) => tender.label);
  const checks = [
    missing.length === 0
      ? { ok: true, text: "Every tender has an account." }
      : {
          ok: false,
          text:
            missing.length === 1
              ? `${missing[0]} has no account.`
              : `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)} have no account.`,
        },
    !vatRegistered
      ? { ok: true, text: "Not registered for VAT, so no VAT is posted." }
      : settings?.defaultTaxCode
        ? { ok: true, text: `VAT is set to ${new Prisma.Decimal(settings.defaultTaxCode.rate).toString()}%.` }
        : { ok: false, text: "No VAT rate is set." },
    // `recordStockMovement` keeps a moving average cost on every stock line.
    { ok: true, text: "Stock is valued at average cost." },
  ];

  return {
    tenders,
    roles,
    schedule,
    lastRun: lastRun
      ? {
          at: lastRun.finishedAt ?? lastRun.startedAt,
          sales: lastRun.salesPosted,
          refunds: lastRun.refundsPosted,
          deliveries: lastRun.deliveriesPosted,
          counts: lastRun.countsPosted,
          failed: lastRun.failed,
        }
      : null,
    checks,
  };
}

/** A save the posting rules refuse: 400 under the field. */
export class PostingRefused extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "PostingRefused";
  }
}

export type PostingPatch = {
  tenders?: Array<{ key: TenderKey; accountId: string; field: string; label: string }>;
  roles?: Array<{ role: RetailAccountRole; accountId: string; field: string; label: string }>;
  schedule?: RetailPostingSchedule;
};

/** Check an account a field chose: the company's, active, a ledger, and of a type that field can take. */
async function checkedAccount(db: Db, companyId: string, accountId: string, field: string, label: string, allowed: AccountType[]) {
  const account = await db.chartOfAccount.findFirst({
    where: { id: accountId, companyId },
    select: { id: true, code: true, name: true, type: true, isActive: true, nodeType: true },
  });
  if (!account) throw new PostingRefused("Choose one of your accounts.", field);
  if (!account.isActive) throw new PostingRefused(`${accountLabel(account)} is not in use.`, field);
  if (account.nodeType !== "LEDGER") {
    throw new PostingRefused(`${accountLabel(account)} is a heading. Choose an account under it.`, field);
  }
  if (!allowed.includes(account.type)) throw new PostingRefused(wrongTypeProblem(account, label, allowed), field);
  return account;
}

/** Write the posting choices inside the settings save's transaction. */
export async function savePosting(tx: Prisma.TransactionClient, actor: RetailAuditActor, patch: PostingPatch): Promise<void> {
  const { companyId } = actor;

  for (const tender of patch.tenders ?? []) {
    const allowed = tender.key === "vouchers" ? VOUCHER_TYPES : TENDER_TYPES;
    const account = await checkedAccount(tx, companyId, tender.accountId, tender.field, tender.label, allowed);
    const where = tenderWhere(companyId, tender.key);
    const existing = await tx.tenderAccountMapping.findFirst({ where, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (existing) {
      await tx.tenderAccountMapping.update({
        where: { id: existing.id },
        data: { clearingAccountId: account.id, isActive: true },
      });
    } else {
      await tx.tenderAccountMapping.create({ data: { ...where, clearingAccountId: account.id, isActive: true } });
    }
  }

  for (const role of patch.roles ?? []) {
    const account = await checkedAccount(tx, companyId, role.accountId, role.field, role.label, ROLE_TYPES[role.role]);
    await tx.retailAccountRoleMapping.upsert({
      where: { companyId_role: { companyId, role: role.role } },
      update: { accountId: account.id },
      create: { companyId, role: role.role, accountId: account.id },
    });
  }

  await tx.retailPostingSettings.upsert({
    where: { companyId },
    update: { ...(patch.schedule ? { schedule: patch.schedule } : {}), updatedById: actor.userId },
    create: { companyId, schedule: patch.schedule ?? DEFAULT_POSTING_SCHEDULE, updatedById: actor.userId },
  });
}

/** A quick add refused: 400 field by field, or 409 when the code is taken. */
export class AccountAddRefused extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly fieldErrors: Record<string, string>,
  ) {
    super(Object.values(fieldErrors)[0] ?? "Check the fields.");
    this.name = "AccountAddRefused";
  }
}

/**
 * "New account" from any account field: "1012 Cash on hand, rand", Asset.
 * The leading digits are the code, unique in the company's chart.
 */
export async function addPostingAccount(
  actor: RetailAuditActor,
  input: { codeAndName: string; type: string },
): Promise<AccountOption> {
  const parsed = parseQuickAccount(input.codeAndName, input.type);
  if (!parsed.ok) throw new AccountAddRefused(400, parsed.fieldErrors);

  const taken = await prisma.chartOfAccount.findFirst({
    where: { companyId: actor.companyId, code: parsed.code },
    select: { code: true, name: true },
  });
  if (taken) {
    throw new AccountAddRefused(409, { codeAndName: `${accountLabel(taken)} already has that code.` });
  }

  return prisma.$transaction(async (tx) => {
    const account = await tx.chartOfAccount.create({
      data: {
        companyId: actor.companyId,
        code: parsed.code,
        name: parsed.name,
        type: parsed.type,
        nodeType: "LEDGER",
        isActive: true,
      },
      select: { id: true, code: true, name: true, type: true },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.postingAccountAdded,
      entityType: "RetailSettings",
      entityId: "posting",
      payload: { accountId: account.id, code: account.code, name: account.name, type: account.type, label: accountLabel(account) },
    });
    return accountOption(account);
  });
}

/** Every retail source a posting run posts. */
export const RETAIL_SOURCE_TYPES: AccountingSourceType[] = [
  "RETAIL_SALE",
  "RETAIL_REFUND",
  "RETAIL_VOID",
  "RETAIL_GOODS_RECEIPT",
  "RETAIL_STOCK_ADJUSTMENT",
  "RETAIL_STOCK_TRANSFER",
  "RETAIL_SHIFT_OPEN",
  "RETAIL_SHIFT_VARIANCE",
];

type RunKind = "sales" | "refunds" | "deliveries" | "counts" | "other";

function kindOf(sourceType: AccountingSourceType | null): RunKind {
  switch (sourceType) {
    case "RETAIL_SALE":
      return "sales";
    case "RETAIL_REFUND":
    case "RETAIL_VOID":
      return "refunds";
    case "RETAIL_GOODS_RECEIPT":
      return "deliveries";
    case "RETAIL_STOCK_ADJUSTMENT":
      return "counts";
    default:
      return "other";
  }
}

export type RunResult = RunCounts & { id: string; at: Date; other: number; failed: number };

const BATCH = 200;

/**
 * One posting pass (W-65): every retail event waiting — sales, refunds,
 * voids, deliveries, counts, adjustments, transfers and shift cash — posted
 * now, whatever its "not before". Writes the `RetailPostingRun` "Last posted"
 * reads and `RETAIL_POSTING.RUN`. The 23:00 job passes `SCHEDULE`, "Post now"
 * `BY_HAND` with who pressed it.
 */
export async function runRetailPosting(
  companyId: string,
  trigger: RetailPostingTrigger,
  actor: RetailAuditActor | null = null,
): Promise<RunResult> {
  const run = await prisma.retailPostingRun.create({
    data: { companyId, trigger, startedById: actor?.userId ?? null },
    select: { id: true, startedAt: true },
  });

  const tally: Record<RunKind, number> & { failed: number } = { sales: 0, refunds: 0, deliveries: 0, counts: 0, other: 0, failed: 0 };
  let cursor: string | undefined;
  for (;;) {
    // By id, so an event that fails is passed once and the pass ends.
    const events = await prisma.accountingIntegrationEvent.findMany({
      where: {
        companyId,
        sourceType: { in: RETAIL_SOURCE_TYPES },
        sourceId: { not: null },
        // What waits for the run; a failed posting is the integration log's to retry.
        status: "PENDING",
        createdAt: { lte: run.startedAt },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    for (const event of events) {
      const outcome = await postIntegrationEvent(event, { actorRole: actor?.userRole ?? null });
      if (outcome === "posted") tally[kindOf(event.sourceType)] += 1;
      else if (outcome === "failed") tally.failed += 1;
    }
    if (events.length < BATCH) break;
    cursor = events.at(-1)!.id;
  }

  const finishedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.retailPostingRun.update({
      where: { id: run.id },
      data: {
        finishedAt,
        salesPosted: tally.sales,
        refundsPosted: tally.refunds,
        deliveriesPosted: tally.deliveries,
        countsPosted: tally.counts,
        otherPosted: tally.other,
        failed: tally.failed,
      },
    });
    const payload = { runId: run.id, trigger, posted: runParts(tally) || null, ...tally };
    const event = { eventType: RETAIL_AUDIT_EVENTS.postingRun, entityType: "RetailSettings", entityId: "posting" };
    if (actor) await writeRetailAuditEvent(tx, { actor, ...event, payload });
    // The 23:00 run: nobody acted.
    else await writePlatformAuditEvent({ companyId, actorId: null, ...event, payload: { actorName: null, ...payload } }, tx);
  });

  return { id: run.id, at: finishedAt, ...tally };
}

/**
 * The 23:00 job (10-setup §4.1): a run for every company that posts at the
 * end of each day — and for one that has since moved to every sale, while
 * events captured before the change still wait.
 */
export async function runScheduledPosting(): Promise<string> {
  // A company with no settings row posts at the end of each day too.
  const companies = await prisma.company.findMany({
    where: {
      postingRules: { some: { sourceType: { in: RETAIL_SOURCE_TYPES } } },
      OR: [
        { retailPostingSettings: null },
        { retailPostingSettings: { schedule: "END_OF_DAY" } },
        { accountingIntegrationEvents: { some: { status: "PENDING", sourceType: { in: RETAIL_SOURCE_TYPES } } } },
      ],
    },
    select: { id: true },
  });
  let posted = 0;
  let failed = 0;
  for (const company of companies) {
    const run = await runRetailPosting(company.id, "SCHEDULE");
    posted += run.sales + run.refunds + run.deliveries + run.counts + run.other;
    failed += run.failed;
  }
  return `${companies.length} shops, ${posted} posted, ${failed} could not post`;
}

export type SetupPreview = {
  accounts: string[];
  vatCodes: string[];
  tenderAccounts: string[];
  /** The currencies with no rate typed: "ZiG", "Rand". */
  rates: string[];
  /** Nothing to add: "Everything is already set up." */
  nothing: boolean;
};

const RATE_WORDS: Record<string, string> = { ZWG: "ZiG", ZAR: "Rand" };

/** "Set up the accounts", grouped as the dialog lists it, from the pack's dry run. */
export function setupPreview(result: AccountingSeedPackResult): SetupPreview {
  const pack = getZimbabweRetailFoundationPack({ workspaceProfile: "RETAIL" });
  const accountName = new Map(pack.accounts.map((row) => [row.code, row.name]));
  const taxName = new Map(pack.taxCodes.map((row) => [row.code, `${row.name}, ${row.rate}%`]));
  const accounts = result.preview.missingAccounts.map((code) => accountLabel({ code, name: accountName.get(code) ?? "" }).trim());
  const vatCodes = result.preview.missingTaxCodes.map((code) => taxName.get(code) ?? code);
  const tenderAccounts = [
    ...result.preview.missingTenderMappings.map((entry) => {
      const [tender, currency] = entry.split(":");
      const key = tenderKeyOf(tender!, currency ?? null);
      return TENDER_OPTIONS.find((option) => option.key === key)?.label ?? entry;
    }),
    ...result.preview.missingRoleMappings.map(
      (role) => ROLE_OPTIONS.find((option) => option.role === role)?.label ?? role,
    ),
  ];
  const rates = result.preview.missingFxQuotes.map((code) => RATE_WORDS[code] ?? code);
  const nothing =
    accounts.length === 0 &&
    vatCodes.length === 0 &&
    tenderAccounts.length === 0 &&
    result.preview.missingPostingRules.length === 0 &&
    result.preview.missingCurrencies.length === 0;
  return { accounts, vatCodes, tenderAccounts: Array.from(new Set(tenderAccounts)), rates, nothing };
}
