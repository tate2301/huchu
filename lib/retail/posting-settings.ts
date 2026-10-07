import { Prisma, type AccountingSourceType, type AccountType, type RetailAccountRole, type RetailPostingSchedule, type RetailPostingTrigger } from "@prisma/client";

import { getZimbabweRetailFoundationPack } from "@/lib/accounting/defaults";
import { ensureAccountingDefaults, type AccountingSeedPackResult } from "@/lib/accounting/bootstrap";
import { postIntegrationEvent } from "@/lib/accounting/integration";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { loadPaymentSettings } from "@/lib/retail/payment-settings";
import { TENDER_OPTIONS, tenderKeyOf, type TenderKey } from "@/lib/retail/payment-words";
import { DEFAULT_POSTING_SCHEDULE, retailPostingSchedule } from "@/lib/retail/posting-schedule";
import {
  accountLabel,
  failedWords,
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
  lastRun: (RunCounts & { at: Date; other: number; failed: number }) | null;
  checks: Array<{ ok: boolean; text: string }>;
};

/** Which fields the page shows: a tender that is on (Payments), VAT when registered, deposits for a liquor store with empties on. */
async function postingFieldsShown(companyId: string, db: Db = prisma) {
  const [payments, profile] = await Promise.all([
    loadPaymentSettings(companyId, db),
    db.retailShopProfile.findUnique({
      where: { companyId },
      select: { businessType: true, vatRegistered: true, emptiesAndDeposits: true },
    }),
  ]);
  const vatRegistered = profile?.vatRegistered ?? true;
  const deposits = profile?.businessType === "LIQUOR" && profile.emptiesAndDeposits;
  return {
    vatRegistered,
    tenderOn: (key: TenderKey) => payments.tenders[key],
    roleShown: (role: RetailAccountRole) =>
      role === "VAT_OUTPUT" ? vatRegistered : role === "DEPOSITS_HELD" ? Boolean(deposits) : true,
  };
}

export async function loadPostingState(companyId: string): Promise<PostingState> {
  const [shown, mappings, roleMappings, schedule, lastRun, settings, failed] = await Promise.all([
    postingFieldsShown(companyId),
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
    // "Last posted" is when the books last took something: a run that found nothing waiting does not move it.
    prisma.retailPostingRun.findFirst({
      where: {
        companyId,
        finishedAt: { not: null },
        OR: [
          { salesPosted: { gt: 0 } },
          { refundsPosted: { gt: 0 } },
          { deliveriesPosted: { gt: 0 } },
          { countsPosted: { gt: 0 } },
          { otherPosted: { gt: 0 } },
        ],
      },
      orderBy: { finishedAt: "desc" },
    }),
    prisma.accountingSettings.findUnique({
      where: { companyId },
      select: { defaultTaxCode: { select: { rate: true } } },
    }),
    prisma.accountingIntegrationEvent.count({
      where: { companyId, sourceType: { in: RETAIL_SOURCE_TYPES }, sourceId: { not: null }, status: "FAILED" },
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
    return { key: option.key, label: option.label, on: shown.tenderOn(option.key), account };
  });

  const { vatRegistered } = shown;
  const roles = ROLE_OPTIONS.map((option) => {
    const mapping = roleMappings.find((row) => row.role === option.role);
    return { ...option, shown: shown.roleShown(option.role), account: mapping ? accountOption(mapping.account) : null };
  });

  // "Ready to post": the three facts a posting run depends on, and anything that could not post.
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
    // What a run could not post waits for the next one: Post now tries it again.
    ...(failed > 0 ? [{ ok: false, text: failedWords(failed) }] : []),
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
          other: lastRun.otherPosted,
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
  // A field the page does not show is not saved: a tender that is off, VAT for a shop not registered.
  const shown = await postingFieldsShown(companyId, tx);
  for (const tender of patch.tenders ?? []) {
    if (!shown.tenderOn(tender.key)) {
      throw new PostingRefused(`${tender.label} is off. Switch it on in Payments first.`, tender.field);
    }
  }
  for (const role of patch.roles ?? []) {
    if (!shown.roleShown(role.role)) throw new PostingRefused(`${role.label} is not posted by this shop.`, role.field);
  }

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
  "RETAIL_OPENING_STOCK",
  "RETAIL_CASH_MOVEMENT",
  "RETAIL_PETTY_CASH",
  "RETAIL_SHIFT_CLOSE",
];

type RunKind = "sales" | "refunds" | "deliveries" | "counts" | "other";

/**
 * What a posted event counts as in "Last posted". Of the stock adjustments
 * only a count is a "count" (its subtype `COUNT_LOSS` / `COUNT_GAIN`); a
 * transfer loss or a reversed movement is something else posted.
 */
export function kindOf(sourceType: AccountingSourceType | null, sourceSubtype: string | null): RunKind {
  switch (sourceType) {
    case "RETAIL_SALE":
      return "sales";
    case "RETAIL_REFUND":
    case "RETAIL_VOID":
      return "refunds";
    case "RETAIL_GOODS_RECEIPT":
      return "deliveries";
    case "RETAIL_STOCK_ADJUSTMENT":
      return sourceSubtype?.startsWith("COUNT_") ? "counts" : "other";
    default:
      return "other";
  }
}

export type RunResult = RunCounts & { id: string; at: Date; other: number; failed: number };

/**
 * One slice of a run: what it has posted so far, whether anything is still
 * waiting, and whether another slice of it was posting (`busy`: ask again in
 * a moment).
 */
export type RunProgress = { run: RunResult; done: boolean; waiting: number; busy: boolean };

const BATCH = 50;

/** A run quiet this long was cut off (its calls stopped): the next Post now closes it and starts again. */
export const RUN_IDLE_MS = 2 * 60_000;

/** How long past its budget a slice holds the run before another may take it (the slice's process died). */
const SLICE_GRACE_MS = 60_000;

/** The 23:00 job posts in slices too, so a Post now pressed meanwhile joins it between slices. */
const WORKER_SLICE_MS = 60_000;

const RUN_COLUMNS = {
  sales: "salesPosted",
  refunds: "refundsPosted",
  deliveries: "deliveriesPosted",
  counts: "countsPosted",
  other: "otherPosted",
} as const satisfies Record<RunKind, keyof Prisma.RetailPostingRunUpdateInput>;

/**
 * What a run posts: every retail event waiting, or that could not post
 * before, captured before the run began and not tried since — so one that
 * fails again is passed once, and the next slice starts where the last one
 * stopped. Posting is idempotent per source, so a retry never posts twice.
 */
function waitingFor(run: { companyId: string; startedAt: Date }) {
  return {
    companyId: run.companyId,
    sourceType: { in: RETAIL_SOURCE_TYPES },
    sourceId: { not: null },
    status: { in: ["PENDING" as const, "FAILED" as const] },
    createdAt: { lte: run.startedAt },
    updatedAt: { lte: run.startedAt },
  };
}

const runResult = (row: {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  salesPosted: number;
  refundsPosted: number;
  deliveriesPosted: number;
  countsPosted: number;
  otherPosted: number;
  failed: number;
}): RunResult => ({
  id: row.id,
  at: row.finishedAt ?? row.startedAt,
  sales: row.salesPosted,
  refunds: row.refundsPosted,
  deliveries: row.deliveriesPosted,
  counts: row.countsPosted,
  other: row.otherPosted,
  failed: row.failed,
});

/**
 * Start a posting pass (W-65), or join the one already going: a company has
 * one run at a time. A Post now pressed while a run is posting — the 23:00
 * job, or the owner's and the bookkeeper's at once — joins it, so the run
 * counts everything it posts. A run gone quiet for `RUN_IDLE_MS` was cut off
 * and is closed where it stopped: what it posted stands. The 23:00 job passes
 * `SCHEDULE`, "Post now" `BY_HAND` with who pressed it.
 */
export async function startRetailPosting(
  companyId: string,
  trigger: RetailPostingTrigger,
  actor: RetailAuditActor | null = null,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Two starts at once wait for each other here, so the second sees the first's run.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('retail-posting-run'), hashtext(${companyId}::text))`;
    const now = new Date();
    const open = await tx.retailPostingRun.findFirst({
      where: { companyId, finishedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true, updatedAt: true, sliceUntil: true },
    });
    const going =
      open && (open.updatedAt.getTime() > now.getTime() - RUN_IDLE_MS || (open.sliceUntil && open.sliceUntil > now));
    if (going) return open.id;
    await tx.retailPostingRun.updateMany({ where: { companyId, finishedAt: null }, data: { finishedAt: now, sliceUntil: null } });
    const run = await tx.retailPostingRun.create({
      data: { companyId, trigger, startedById: actor?.userId ?? null, startedAt: now },
      select: { id: true },
    });
    return run.id;
  });
}

/**
 * Post what the run is waiting on, for about `budgetMs`. One slice of a run
 * posts at a time: it takes the run until `sliceUntil`, and a second caller
 * meanwhile is told `busy` without posting anything. Each event is counted
 * once it has posted. When nothing is left the run finishes: "Last posted"
 * reads it and `RETAIL_POSTING.RUN` is written.
 */
export async function continueRetailPosting(
  companyId: string,
  runId: string,
  actor: RetailAuditActor | null,
  budgetMs: number,
): Promise<RunProgress | null> {
  const run = await prisma.retailPostingRun.findFirst({ where: { id: runId, companyId } });
  if (!run) return null;
  if (run.finishedAt) return { run: runResult(run), done: true, waiting: 0, busy: false };

  const where = waitingFor(run);
  const began = Date.now();
  const taken = await prisma.retailPostingRun.updateMany({
    where: { id: run.id, finishedAt: null, OR: [{ sliceUntil: null }, { sliceUntil: { lt: new Date(began) } }] },
    data: { sliceUntil: new Date(began + budgetMs + SLICE_GRACE_MS) },
  });
  if (taken.count === 0) {
    const now = await prisma.retailPostingRun.findUniqueOrThrow({ where: { id: run.id } });
    const waiting = now.finishedAt ? 0 : await prisma.accountingIntegrationEvent.count({ where });
    return { run: runResult(now), done: Boolean(now.finishedAt), waiting, busy: !now.finishedAt };
  }

  try {
    await ensureAccountingDefaults(companyId);
    let outOfTime = false;
    while (!outOfTime) {
      // In the order they were captured, so entry numbers follow the sales.
      const events = await prisma.accountingIntegrationEvent.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: BATCH,
      });
      if (events.length === 0) break;
      for (const event of events) {
        if (Date.now() - began >= budgetMs) {
          outOfTime = true;
          break;
        }
        const outcome = await postIntegrationEvent(event, { actorRole: actor?.userRole ?? null, defaultsReady: true }).catch(
          async (error: unknown) => {
            // Marked, so the run passes it once rather than meeting it on every slice.
            await prisma.accountingIntegrationEvent.update({
              where: { id: event.id },
              data: {
                status: "FAILED",
                lastError: (error instanceof Error ? error.message : "Posting failed").slice(0, 1000),
                attemptCount: { increment: 1 },
              },
            });
            return "failed" as const;
          },
        );
        // Counted as it lands, so a slice cut off leaves the run's counts true.
        const column =
          outcome === "posted"
            ? RUN_COLUMNS[kindOf(event.sourceType, event.sourceSubtype)]
            : outcome === "failed"
              ? "failed"
              : null;
        if (column) await prisma.retailPostingRun.update({ where: { id: run.id }, data: { [column]: { increment: 1 } } });
      }
    }
  } catch (error) {
    await prisma.retailPostingRun.update({ where: { id: run.id }, data: { sliceUntil: null } });
    throw error;
  }

  const waiting = await prisma.accountingIntegrationEvent.count({ where });
  if (waiting > 0) {
    const now = await prisma.retailPostingRun.update({ where: { id: run.id }, data: { sliceUntil: null } });
    return { run: runResult(now), done: false, waiting, busy: false };
  }

  const finished = await prisma.$transaction(async (tx) => {
    const row = await tx.retailPostingRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), sliceUntil: null } });
    const result = runResult(row);
    const tally = {
      sales: result.sales,
      refunds: result.refunds,
      deliveries: result.deliveries,
      counts: result.counts,
      other: result.other,
      failed: result.failed,
    };
    const payload = { runId: run.id, trigger: run.trigger, posted: runParts(tally) || null, ...tally };
    const event = { eventType: RETAIL_AUDIT_EVENTS.postingRun, entityType: "RetailSettings", entityId: "posting" };
    if (actor) await writeRetailAuditEvent(tx, { actor, ...event, payload });
    // The 23:00 run: nobody acted.
    else await writePlatformAuditEvent({ companyId, actorId: null, ...event, payload: { actorName: null, ...payload } }, tx);
    return result;
  });
  return { run: finished, done: true, waiting: 0, busy: false };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One whole posting pass, start to finish: every retail event waiting —
 * sales, refunds, voids, deliveries, counts, adjustments, transfers and shift
 * cash — posted now, whatever its "not before". The 23:00 job; it joins a
 * Post now already going, and waits its turn while that one's slice posts.
 */
export async function runRetailPosting(
  companyId: string,
  trigger: RetailPostingTrigger,
  actor: RetailAuditActor | null = null,
): Promise<RunResult> {
  const runId = await startRetailPosting(companyId, trigger, actor);
  for (;;) {
    const progress = (await continueRetailPosting(companyId, runId, actor, WORKER_SLICE_MS))!;
    if (progress.done) return progress.run;
    if (progress.busy) await pause(1_000);
  }
}

/**
 * The 23:00 job (10-setup §4.1): a run for every company that posts at the
 * end of each day — and for one that has since moved to every sale, while
 * events captured before the change still wait or could not post.
 */
export async function runScheduledPosting(): Promise<string> {
  // A company with no settings row posts at the end of each day too.
  const companies = await prisma.company.findMany({
    where: {
      postingRules: { some: { sourceType: { in: RETAIL_SOURCE_TYPES } } },
      OR: [
        { retailPostingSettings: null },
        { retailPostingSettings: { schedule: "END_OF_DAY" } },
        {
          accountingIntegrationEvents: {
            some: { status: { in: ["PENDING", "FAILED"] }, sourceType: { in: RETAIL_SOURCE_TYPES } },
          },
        },
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
  /** The currencies with no rate yet, one rate field each: ZWG "ZiG", ZAR "rand". */
  rates: Array<{ code: string; label: string }>;
  /** Nothing to add: "Everything is already set up." */
  nothing: boolean;
};

const RATE_WORDS: Record<string, string> = { ZWG: "ZiG", ZAR: "rand" };

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
  const rates = result.preview.missingFxQuotes.map((code) => ({ code, label: RATE_WORDS[code] ?? code }));
  const nothing =
    rates.length === 0 &&
    accounts.length === 0 &&
    vatCodes.length === 0 &&
    tenderAccounts.length === 0 &&
    result.preview.missingPostingRules.length === 0 &&
    result.preview.missingCurrencies.length === 0;
  return { accounts, vatCodes, tenderAccounts: Array.from(new Set(tenderAccounts)), rates, nothing };
}
