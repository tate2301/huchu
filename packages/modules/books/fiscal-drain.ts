/**
 * FD-6 — the drainer: pending and failed fiscal receipts retry without a human.
 *
 * `issueFiscalDocument` writes its PENDING row before it dials FDGA, which is
 * what makes a timeout or a crash survivable — but until now the only thing
 * that ever turned those rows back into attempts was a person opening the
 * console and pressing Replay (`app/api/accounting/fiscalisation/replay`). An
 * outage that starts at 17:00 therefore heals at 09:00 the next morning, and in
 * the meantime the fiscal day cannot close (`closeFiscalDay` refuses to close
 * around unsubmitted receipts) and every customer holds a slip whose QR does
 * not resolve. This module is that route's dispatch logic lifted out of the
 * request cycle so `scripts/fiscal-worker.ts` can run it on a loop.
 *
 * Three things here are not the obvious implementation, and each is load-bearing:
 *
 * 1. **A row is claimed, not selected.** More than one worker is expected —
 *    two app hosts, a redeploy overlapping the old process, an operator running
 *    the script by hand during an incident. `SELECT ... then UPDATE` hands the
 *    same receipt to both, and two concurrent submissions of one receipt burn
 *    two idempotency keys against FDGA for a document that must exist once. The
 *    claim below is a single `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP
 *    LOCKED)` that leases the row by pushing `nextRetryAt` into the future: the
 *    second worker's subquery skips the locked row, and even without the skip
 *    its predicate would no longer match. This is the same principle as
 *    `reserveNextReceiptNumbers` — let the database decide the race rather than
 *    a read in front of a write.
 *
 * 2. **The lease is a lease, not a lock.** It expires. A worker that is SIGKILLed
 *    mid-attempt leaves the row leased and nothing to release it, so the lease
 *    is a time the row becomes due again rather than a flag someone has to
 *    clear. `CLAIM_LEASE_MS` is therefore an upper bound on how long one attempt
 *    may take before another worker is allowed to duplicate it.
 *
 * 3. **Attempts always move forward, so a poison receipt cannot spin.** Some
 *    refusals never touch the row at all — an unmapped tax code, a missing
 *    provider config, `FISCAL_RECEIPT_ALTERED` — so waiting for
 *    `issueFiscalDocument` to increment `attemptCount` would loop on them
 *    forever at the retry interval. The settle step below advances the count
 *    itself when the issuer did not, and past `maxAttempts` the row is left
 *    FAILED with the reason and stops being claimed. Nothing deletes it: a
 *    human still replays it from the console once whatever it is complaining
 *    about is fixed.
 *
 * Time comes from the database clock, not this process's. Two workers on two
 * hosts with a few seconds of skew between them would otherwise disagree about
 * which rows are due, and the one whose clock runs fast would steal leases that
 * have not expired. `NOW() AT TIME ZONE 'UTC'` is used rather than bare `NOW()`
 * because Prisma stores `timestamp without time zone` holding UTC, and a
 * session on a non-UTC timezone would silently shift every comparison.
 *
 * No transport lives here. Re-issuing goes back through the same issuer the
 * original document used, and therefore through the connector seam, so the
 * drain has no idea what FDGA looks like and can be tested against a real
 * database with no network at all.
 */
import { Prisma as PrismaNs } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import { issueFiscalReceipt } from "./fiscalisation";
import { registry } from "@corelithzw/platform/registry";

/** How many receipts one pass claims. Small on purpose: a pass holds its leases
 *  for as long as it takes to submit the batch serially, and a short pass that
 *  runs often recovers from a crash faster than a long one that does not. */
const DEFAULT_BATCH_SIZE = 25;

/**
 * Attempts before a receipt is left alone.
 *
 * Eight attempts at the backoff below is roughly a day of trying, which is the
 * point at which the problem is not going to solve itself and a person needs to
 * look. Giving up is not giving up on the receipt — the row stays FAILED with
 * its reason, holds its place in the chain, and the console can still replay it.
 */
const DEFAULT_MAX_ATTEMPTS = 8;

/** How long a claimed receipt is invisible to other workers. Longer than any
 *  single FDGA call may take, short enough that a killed worker's rows come
 *  back on their own. */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

/** Mirrors the connector's default retry policy (`lib/accounting/fdms-connector.ts`),
 *  so a row the drainer schedules and a row the connector schedules read the
 *  same to whoever is looking at the queue. */
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 24 * 60 * 60 * 1000;

/** How long before a receipt nothing can issue yet is looked at again. These
 *  rows are waiting on code or on a purchase, not on the network, so they are
 *  re-checked hourly rather than backed off — and they never burn an attempt,
 *  because nothing was attempted. */
const RECHECK_MS = 60 * 60 * 1000;

/** How long a backlog has to persist before it is worth waking somebody for. */
const DEFAULT_SUSTAINED_FAILURE_MS = 30 * 60 * 1000;

/** One notice per tenant per this window. A worker loop runs every few seconds;
 *  without a cooldown an outage would produce a notification per pass. */
const DEFAULT_NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** `issueFiscalReceipt` takes an actor for symmetry with the console path and
 *  ignores it. Named rather than empty so it reads honestly in any future log. */
const DRAIN_ACTOR_ID = "fiscal-worker";

export const FISCAL_DRAIN_DEFAULTS = {
  batchSize: DEFAULT_BATCH_SIZE,
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  leaseMs: CLAIM_LEASE_MS,
  sustainedFailureMs: DEFAULT_SUSTAINED_FAILURE_MS,
  notifyCooldownMs: DEFAULT_NOTIFY_COOLDOWN_MS,
} as const;

/**
 * What happened to one claimed receipt.
 *
 * `DEFERRED` and `SKIPPED` are deliberately not `FAILED`: a credit note this
 * build has no issuer for, and a school that never bought the add-on, are both
 * rows with nothing wrong with them. Counting them as failures would make a
 * healthy queue look broken and would eventually notify somebody about it.
 */
export type FiscalDrainOutcome =
  | "SUCCEEDED"
  | "RETRY_SCHEDULED"
  | "GAVE_UP"
  | "DEFERRED"
  | "SKIPPED";

export type FiscalDrainReceiptResult = {
  receiptId: string;
  companyId: string;
  outcome: FiscalDrainOutcome;
  attemptCount: number;
  nextRetryAt: Date | null;
  error?: string | null;
};

export type FiscalDrainResult = {
  claimed: number;
  succeeded: number;
  retryScheduled: number;
  gaveUp: number;
  deferred: number;
  skipped: number;
  /** Companies a sustained-failure notice went out for on this pass. */
  notified: string[];
  receipts: FiscalDrainReceiptResult[];
};

/** What the issuers report back. Mirrors `FiscalIssueResult` plus the schools
 *  module's `SKIPPED`, which the accounting path has no equivalent of. */
export type FiscalDrainIssueOutcome = {
  status: "SUCCESS" | "PENDING" | "FAILED" | "SKIPPED";
  error?: string | null;
};

/**
 * The re-issue seam.
 *
 * Injected so the tests can exercise claiming, backoff and exhaustion against a
 * real database without a network, and so a future FD-4.1/FD-5.1 can add a
 * credit-note or till-sale issuer here rather than inside the loop.
 */
export type FiscalDrainIssuers = {
  salesInvoice: (args: { companyId: string; invoiceId: string }) => Promise<FiscalDrainIssueOutcome>;
  schoolFeeReceipt: (args: {
    companyId: string;
    receiptId: string;
  }) => Promise<FiscalDrainIssueOutcome>;
};

/**
 * The issuers the host registered for the receipts another module writes —
 * a school's fee receipt is the first — keyed the way `FiscalDrainIssuers`
 * names them. Books issues its own invoices; it never imports a school.
 */
const registeredIssuers = registry<Partial<Omit<FiscalDrainIssuers, "salesInvoice">>>(
  "books.fiscal-drain-issuers",
  () => ({}),
);

export function registerFiscalDrainIssuer<K extends keyof Omit<FiscalDrainIssuers, "salesInvoice">>(
  kind: K,
  issuer: FiscalDrainIssuers[K],
): void {
  registeredIssuers[kind] = issuer;
}

/**
 * The receipts another module posted but never fiscalised — a process that
 * died between the payment's commit and the fiscal call — which the replay
 * sweeps as well as the retries. The module that owns the receipts finds
 * them; the host registers it beside the issuer.
 */
export type FiscalDrainSweep = {
  unattempted: (args: { companyId: string; limit: number }) => Promise<string[]>;
};

const registeredSweeps = registry<Partial<Record<keyof Omit<FiscalDrainIssuers, "salesInvoice">, FiscalDrainSweep>>>(
  "books.fiscal-drain-sweeps",
  () => ({}),
);

export function registerFiscalDrainSweep<K extends keyof Omit<FiscalDrainIssuers, "salesInvoice">>(kind: K, sweep: FiscalDrainSweep): void {
  registeredSweeps[kind] = sweep;
}

export function fiscalDrainSweep<K extends keyof Omit<FiscalDrainIssuers, "salesInvoice">>(kind: K): FiscalDrainSweep | undefined {
  return registeredSweeps[kind];
}

export const defaultFiscalDrainIssuers: FiscalDrainIssuers = {
  salesInvoice: async ({ companyId, invoiceId }) => {
    const result = await issueFiscalReceipt(companyId, invoiceId, DRAIN_ACTOR_ID);
    return { status: result.status, error: result.error ?? null };
  },
  schoolFeeReceipt: async (args) => {
    const issuer = registeredIssuers.schoolFeeReceipt;
    if (!issuer) {
      throw new Error("No fiscal issuer registered for school fee receipts: the host must call registerFiscalDrainIssuer(\"schoolFeeReceipt\", …) in modules.ts.");
    }
    return issuer(args);
  },
};

/**
 * What the drain says when a tenant's receipts have been stuck for a while.
 * Raising the incident is the compliance module's business; the host wires
 * its emitter here (`onFiscalBacklog`), and the drain only describes it.
 */
export type FiscalBacklogEvent = {
  companyId: string;
  actorId: string;
  incidentId: string;
  title: string;
};

const backlogListeners = registry<Set<(event: FiscalBacklogEvent) => Promise<unknown>>>(
  "books.fiscal-backlog-listeners",
  () => new Set(),
);

export function onFiscalBacklog(listener: (event: FiscalBacklogEvent) => Promise<unknown>): void {
  backlogListeners.add(listener);
}

export type FiscalDrainOptions = {
  /** Restrict the pass to one tenant. Omitted, the drain is platform-wide,
   *  which is what the worker runs — a per-tenant loop would starve whichever
   *  tenant sorted last. */
  companyId?: string;
  batchSize?: number;
  maxAttempts?: number;
  leaseMs?: number;
  issuers?: FiscalDrainIssuers;
  /** Off in tests that are not about notifications. */
  notify?: boolean;
  sustainedFailureMs?: number;
  notifyCooldownMs?: number;
};

type ClaimedRow = {
  id: string;
  companyId: string;
  invoiceId: string | null;
  schoolReceiptId: string | null;
  creditNoteId: string | null;
  retailSaleId: string | null;
  attemptCount: number;
};

/**
 * Exponential backoff, capped. Attempt 1 waits 5 minutes, attempt 8 waits the
 * 24-hour ceiling; an FDGA outage is therefore retried hard early — when it is
 * most likely a blip — and then stops hammering.
 */
export function fiscalRetryDelayMs(attemptCount: number): number {
  const multiplier = 2 ** Math.max(attemptCount - 1, 0);
  return Math.min(RETRY_BASE_MS * multiplier, RETRY_MAX_MS);
}

/**
 * Claim up to `batchSize` due receipts for this worker.
 *
 * One statement, and every part of it is doing something:
 *
 *   * `FOR UPDATE SKIP LOCKED` lets a second worker running at the same instant
 *     take the *next* rows instead of blocking on ours or duplicating them.
 *   * Writing `nextRetryAt` forward is the lease — a worker that reads the table
 *     a millisecond later sees these rows as not due.
 *   * `attemptCount < maxAttempts` is what stops a poison receipt from ever
 *     being claimed again, and it lives in the predicate rather than in a filter
 *     afterwards so an exhausted row costs nothing at all.
 *   * The order is oldest-due-first. A row that has never been scheduled
 *     (`nextRetryAt` null — the shape `issueFiscalDocument` leaves after a
 *     refusal that never reached the network) sorts by when it was created, so
 *     it cannot jump the queue or be starved by it.
 */
async function claimDueReceipts(args: {
  companyId?: string;
  batchSize: number;
  maxAttempts: number;
  leaseMs: number;
}): Promise<ClaimedRow[]> {
  const leaseSeconds = Math.ceil(args.leaseMs / 1000);
  const companyId = args.companyId ?? null;

  const rows = await prisma.$queryRaw<ClaimedRow[]>(PrismaNs.sql`
    UPDATE "FiscalReceipt" AS r
       SET "nextRetryAt" = (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${leaseSeconds}::double precision),
           "updatedAt"   = NOW()
      FROM (
             SELECT d."id"
               FROM "FiscalReceipt" d
              WHERE d."status" IN (
                      'PENDING'::"FiscalReceiptStatus",
                      'FAILED'::"FiscalReceiptStatus"
                    )
                AND (d."nextRetryAt" IS NULL OR d."nextRetryAt" <= (NOW() AT TIME ZONE 'UTC'))
                AND d."attemptCount" < ${args.maxAttempts}
                AND (${companyId}::text IS NULL OR d."companyId" = ${companyId}::text)
              ORDER BY COALESCE(d."nextRetryAt", d."createdAt") ASC, d."createdAt" ASC
              LIMIT ${args.batchSize}
                FOR UPDATE SKIP LOCKED
           ) AS due
     WHERE r."id" = due."id"
    RETURNING r."id",
              r."companyId",
              r."invoiceId",
              r."schoolReceiptId",
              r."creditNoteId",
              r."retailSaleId",
              r."attemptCount"
  `);

  return rows.map((row) => ({ ...row, attemptCount: Number(row.attemptCount) }));
}

/**
 * Record the outcome of one attempt.
 *
 * Guarded on the row not already being SUCCESS or VOIDED: the issuer writes the
 * accepted state itself, and a concurrent void is a decision a human made that
 * a worker must not undo.
 *
 * `attemptCount` is written as `max(what the issuer left, what we claimed + 1)`
 * rather than incremented. A refusal that never reached the network leaves the
 * count untouched, and a row whose count never rises is a row that retries
 * forever — the exact poison case `maxAttempts` exists to end. Taking the max
 * rather than always adding one avoids double-counting the attempt the issuer
 * did record.
 */
async function settleAttempt(args: {
  claimed: ClaimedRow;
  outcome: Exclude<FiscalDrainOutcome, "SUCCEEDED">;
  /** The issuer's own verdict. PENDING means the provider took it for later
   *  confirmation; the row is still unsubmitted and still on the retry
   *  schedule, but calling it FAILED would be untrue. */
  issuerStatus: "PENDING" | "FAILED" | "SKIPPED";
  error: string | null;
  maxAttempts: number;
}): Promise<FiscalDrainReceiptResult> {
  const { claimed, outcome } = args;

  const current = await prisma.fiscalReceipt.findUnique({
    where: { id: claimed.id },
    select: { status: true, attemptCount: true, nextRetryAt: true },
  });

  // Nothing was attempted, so nothing is spent: hand the row back with a
  // recheck time and its original attempt count.
  if (outcome === "DEFERRED" || outcome === "SKIPPED") {
    const nextRetryAt = new Date(Date.now() + RECHECK_MS);
    await prisma.fiscalReceipt.updateMany({
      where: { id: claimed.id, status: { in: ["PENDING", "FAILED"] } },
      data: { nextRetryAt, lastError: args.error ?? undefined },
    });
    return {
      receiptId: claimed.id,
      companyId: claimed.companyId,
      outcome,
      attemptCount: current?.attemptCount ?? claimed.attemptCount,
      nextRetryAt,
      error: args.error,
    };
  }

  const attemptCount = Math.max(current?.attemptCount ?? 0, claimed.attemptCount + 1);
  const exhausted = attemptCount >= args.maxAttempts;

  // Whichever schedule is later wins, and the drain never has to work out
  // whether the timestamp on the row is its own lease or a backoff the issuer
  // computed from the tenant's `retryPolicyJson`. A tenant who configured a
  // longer wait than ours keeps it; the lease — which is always shorter than
  // the backoff for the attempt that just failed — never shortens it.
  const ownBackoff = Date.now() + fiscalRetryDelayMs(attemptCount);
  const issuerBackoff = current?.nextRetryAt?.getTime() ?? 0;
  const nextRetryAt = exhausted ? null : new Date(Math.max(ownBackoff, issuerBackoff));

  const lastError = exhausted
    ? `Gave up after ${attemptCount} attempts: ${args.error ?? "no reason recorded"}`
    : args.error;

  await prisma.fiscalReceipt.updateMany({
    where: { id: claimed.id, status: { in: ["PENDING", "FAILED"] } },
    data: {
      // An exhausted receipt is FAILED whatever the last attempt said: it never
      // reached ZIMRA and nothing is going to try again on its own.
      status: args.issuerStatus === "PENDING" && !exhausted ? "PENDING" : "FAILED",
      attemptCount,
      nextRetryAt,
      lastError: lastError ?? undefined,
    },
  });

  return {
    receiptId: claimed.id,
    companyId: claimed.companyId,
    outcome: exhausted ? "GAVE_UP" : "RETRY_SCHEDULED",
    attemptCount,
    nextRetryAt,
    error: lastError,
  };
}

/** Re-issue one claimed row through the issuer that matches its source. */
async function attemptReceipt(args: {
  claimed: ClaimedRow;
  issuers: FiscalDrainIssuers;
  maxAttempts: number;
}): Promise<FiscalDrainReceiptResult> {
  const { claimed } = args;

  const run = async (): Promise<FiscalDrainIssueOutcome> => {
    if (claimed.invoiceId) {
      return args.issuers.salesInvoice({
        companyId: claimed.companyId,
        invoiceId: claimed.invoiceId,
      });
    }
    if (claimed.schoolReceiptId) {
      return args.issuers.schoolFeeReceipt({
        companyId: claimed.companyId,
        receiptId: claimed.schoolReceiptId,
      });
    }
    if (claimed.creditNoteId || claimed.retailSaleId) {
      // FD-0.4a widened `FiscalReceipt` to four sources; only two of them have
      // an issuer. Re-issuing needs the signing input rebuilt from the source
      // document, which is FD-4.1 (credit note) and FD-5.1 (till sale). Nothing
      // is wrong with these rows and no attempt was made, so they neither fail
      // nor count against the attempt budget.
      return { status: "SKIPPED", error: "No issuer for this fiscal source yet" };
    }
    // `FiscalReceipt_one_source_check` makes a row naming no source impossible.
    // It is surfaced as a real failure rather than ignored, so a constraint that
    // has stopped holding is discovered here and not by a chain that will not
    // verify.
    throw new Error("Fiscal receipt names no source document");
  };

  let result: FiscalDrainIssueOutcome;
  try {
    result = await run();
  } catch (error) {
    result = {
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown fiscal drain error",
    };
  }

  if (result.status === "SUCCESS") {
    const row = await prisma.fiscalReceipt.findUnique({
      where: { id: claimed.id },
      select: { attemptCount: true, nextRetryAt: true },
    });
    return {
      receiptId: claimed.id,
      companyId: claimed.companyId,
      outcome: "SUCCEEDED",
      attemptCount: row?.attemptCount ?? claimed.attemptCount + 1,
      nextRetryAt: row?.nextRetryAt ?? null,
      error: null,
    };
  }

  // PENDING from the issuer means the provider took it for later confirmation,
  // not that it landed — the row is still unsubmitted as far as
  // `closeFiscalDay` is concerned, so it stays on the retry schedule and a
  // later attempt (or `syncFiscalReceiptStatus`) resolves it.
  const parked = result.status === "SKIPPED";
  return settleAttempt({
    claimed,
    outcome: parked
      ? claimed.creditNoteId || claimed.retailSaleId
        ? "DEFERRED"
        : "SKIPPED"
      : "RETRY_SCHEDULED",
    issuerStatus: result.status,
    error: result.error ?? null,
    maxAttempts: args.maxAttempts,
  });
}

/**
 * Wake somebody when a tenant's fiscalisation has been failing for a while.
 *
 * The trigger is deliberately not "an attempt failed" — one failed attempt is
 * the normal shape of a blip and the drainer is there precisely so nobody has
 * to care about it. It is the backlog *persisting*: the oldest unsubmitted
 * receipt older than `sustainedFailureMs`, or a receipt that has exhausted its
 * attempts, which is by definition no longer self-healing.
 *
 * The cooldown is checked against the notification table rather than held in
 * memory because more than one worker process is expected, and a per-process
 * memo would notify once per process.
 *
 * The notice goes out as an OPS incident. There is no fiscal `NotificationType`
 * in the schema yet and adding one is a migration this story does not own, so
 * the generic ops-incident emitter carries it: managers are the right audience
 * and the ops category is the right switch, but the incident deep-link the
 * notification payload builds does not resolve. Replacing this with a purpose-
 * built `emitFiscalBacklogNotification` is the FD-6.2 console story's job.
 */
async function notifySustainedFailure(args: {
  companyId: string;
  sustainedFailureMs: number;
  notifyCooldownMs: number;
  sawExhausted: boolean;
}): Promise<boolean> {
  const entityId = `fiscal-drain:${args.companyId}`;

  const [stuck, oldest] = await Promise.all([
    prisma.fiscalReceipt.count({
      where: { companyId: args.companyId, status: { in: ["PENDING", "FAILED"] } },
    }),
    prisma.fiscalReceipt.findFirst({
      where: { companyId: args.companyId, status: { in: ["PENDING", "FAILED"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  if (stuck === 0 || !oldest) return false;

  const oldestAgeMs = Date.now() - oldest.createdAt.getTime();
  if (!args.sawExhausted && oldestAgeMs < args.sustainedFailureMs) return false;

  const recent = await prisma.notification.findFirst({
    where: {
      companyId: args.companyId,
      entityType: "INCIDENT",
      entityId,
      createdAt: { gte: new Date(Date.now() - args.notifyCooldownMs) },
    },
    select: { id: true },
  });
  if (recent) return false;

  const oldestMinutes = Math.floor(oldestAgeMs / 60000);
  const event: FiscalBacklogEvent = {
    companyId: args.companyId,
    actorId: DRAIN_ACTOR_ID,
    incidentId: entityId,
    title: `Fiscalisation backlog: ${stuck} receipt${stuck === 1 ? "" : "s"} unsent, oldest ${oldestMinutes}m`,
  };
  for (const listener of backlogListeners) {
    await listener(event);
  }

  return true;
}

/**
 * One pass: claim what is due, re-issue it, record what happened, and notify if
 * a tenant has been stuck for a while.
 *
 * Receipts are worked one at a time rather than in parallel. Native receipts on
 * one device genuinely cannot be signed concurrently — each carries the
 * previous one's hash — and a burst of parallel submissions against FDGA during
 * an outage is how a recovering gateway is knocked over again.
 *
 * The pass never throws for a receipt: an issuer that blows up is recorded as
 * that receipt's failure and the batch continues, because one bad row must not
 * stop the queue behind it.
 */
export async function drainDueFiscalReceipts(
  options: FiscalDrainOptions = {},
): Promise<FiscalDrainResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const leaseMs = options.leaseMs ?? CLAIM_LEASE_MS;
  const issuers = options.issuers ?? defaultFiscalDrainIssuers;

  const claimed = await claimDueReceipts({
    companyId: options.companyId,
    batchSize,
    maxAttempts,
    leaseMs,
  });

  const receipts: FiscalDrainReceiptResult[] = [];
  for (const row of claimed) {
    receipts.push(
      await attemptReceipt({ claimed: row, issuers, maxAttempts }),
    );
  }

  const notified: string[] = [];
  if (options.notify !== false) {
    const troubled = new Map<string, boolean>();
    for (const receipt of receipts) {
      if (receipt.outcome !== "RETRY_SCHEDULED" && receipt.outcome !== "GAVE_UP") continue;
      troubled.set(
        receipt.companyId,
        (troubled.get(receipt.companyId) ?? false) || receipt.outcome === "GAVE_UP",
      );
    }
    for (const [companyId, sawExhausted] of troubled) {
      try {
        const sent = await notifySustainedFailure({
          companyId,
          sustainedFailureMs: options.sustainedFailureMs ?? DEFAULT_SUSTAINED_FAILURE_MS,
          notifyCooldownMs: options.notifyCooldownMs ?? DEFAULT_NOTIFY_COOLDOWN_MS,
          sawExhausted,
        });
        if (sent) notified.push(companyId);
      } catch (error) {
        // Failing to raise the alarm must never stop the drain that is trying
        // to fix the thing the alarm is about.
        console.error("[fiscal-drain] notification failed", companyId, error);
      }
    }
  }

  const count = (outcome: FiscalDrainOutcome) =>
    receipts.filter((r) => r.outcome === outcome).length;

  return {
    claimed: claimed.length,
    succeeded: count("SUCCEEDED"),
    retryScheduled: count("RETRY_SCHEDULED"),
    gaveUp: count("GAVE_UP"),
    deferred: count("DEFERRED"),
    skipped: count("SKIPPED"),
    notified,
    receipts,
  };
}
