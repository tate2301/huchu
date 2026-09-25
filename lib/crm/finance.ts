/**
 * Finance for people who are not accountants.
 *
 * The CRM's money — requisitions, floats, cash in and out of people's hands —
 * posts to the ledger through `money-posting.ts`. This module is the other
 * direction: it *reads* accounting to answer questions a manager asks in
 * plain words ("has the cash Tendai collected been receipted?"), and it never
 * writes to the ledger. A dashboard that could change the books would be a
 * second set of books.
 */

import { Prisma } from "@prisma/client";

import { overBudgetProjectIds, projectCostSummary } from "@/lib/crm/projects";
import { outstandingFloat, payableAmount } from "@/lib/crm/requisitions";

type Tx = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

/** Anything under half a cent is rounding, not money anybody is holding. */
const HALF_CENT = new Prisma.Decimal("0.005");

/**
 * Cash logged against one invoice that accounting has not receipted.
 *
 * Money in the field and money in the books arrive by different roads: a rep
 * collecting a deposit on site logs it in their cost tracker against the
 * invoice, and the office records the receipt that settles it. Until the
 * second happens, the first is cash in somebody's hand that the business has
 * no receipt for — which is where floats go missing.
 */
export type ReceiptGap = {
  invoiceDocumentId: string;
  /** What people in the field have logged against the invoice. */
  logged: Prisma.Decimal;
  /** What accounting has receipted on it — `SalesInvoice.amountPaid`. */
  receipted: Prisma.Decimal;
  /** Logged less receipted. Always positive: no gap, no entry. */
  unreceipted: Prisma.Decimal;
  currency: string;
};

/**
 * The gap on one invoice, or null when there is none.
 *
 * Totals, not payments, on purpose: the office may have receipted the money
 * as one payment when two reps logged it as two, or taken part of it by bank
 * transfer. What matters is whether the invoice has been paid at least as much
 * as the field says it collected. Pure, so the rule is testable without a
 * database.
 */
export function receiptGap(
  logged: Prisma.Decimal | number | string,
  receipted: Prisma.Decimal | number | string,
): Prisma.Decimal | null {
  const gap = new Prisma.Decimal(logged).minus(new Prisma.Decimal(receipted).toDecimalPlaces(2));
  return gap.greaterThanOrEqualTo(HALF_CENT) ? gap : null;
}

/**
 * Every invoice with cash logged against it and not yet receipted.
 *
 * Read-only against accounting: it sums the cost tracker's RECEIVED lines per
 * invoice document and compares them with the invoice's `amountPaid`. Nothing
 * is written, reserved or matched.
 */
export async function receiptGaps(
  tx: Tx,
  companyId: string,
  options: { invoiceDocumentIds?: string[] } = {},
): Promise<Map<string, ReceiptGap>> {
  const logged = await tx.crmDailyCostEntry.groupBy({
    by: ["invoiceDocumentId"],
    where: {
      companyId,
      direction: "RECEIVED",
      invoiceDocumentId: options.invoiceDocumentIds
        ? { in: options.invoiceDocumentIds }
        : { not: null },
    },
    _sum: { amount: true },
  });
  if (logged.length === 0) return new Map();

  const documents = await tx.crmLeadDocument.findMany({
    where: { companyId, id: { in: logged.map((row) => row.invoiceDocumentId as string) } },
    select: { id: true, currency: true, invoice: { select: { amountPaid: true, currency: true } } },
  });
  const byId = new Map(documents.map((document) => [document.id, document]));

  const gaps = new Map<string, ReceiptGap>();
  for (const row of logged) {
    const documentId = row.invoiceDocumentId as string;
    const document = byId.get(documentId);
    const loggedAmount = row._sum.amount ?? ZERO;
    const receipted = new Prisma.Decimal(document?.invoice?.amountPaid ?? 0);
    const unreceipted = receiptGap(loggedAmount, receipted);
    if (!unreceipted) continue;
    gaps.set(documentId, {
      invoiceDocumentId: documentId,
      logged: loggedAmount,
      receipted,
      unreceipted,
      currency: document?.invoice?.currency ?? document?.currency ?? "USD",
    });
  }
  return gaps;
}

/**
 * Whether one line is cash not yet receipted.
 *
 * A line is flagged when it is money received against an invoice that has a
 * gap. Every line on that invoice carries the flag until the office catches
 * up, because which of three collections is the unreceipted one is not a
 * question the totals can answer — and the person who logged each of them is
 * the one to ask.
 */
export function isNotReceipted(
  entry: { direction: string; invoiceDocumentId: string | null },
  gaps: Map<string, ReceiptGap>,
): boolean {
  return entry.direction === "RECEIVED" && entry.invoiceDocumentId !== null && gaps.has(entry.invoiceDocumentId);
}

/**
 * A receipt gap shared among the people who logged the cash.
 *
 * Nobody can say which of two collections against one invoice is the part the
 * office has not receipted, so the gap is split in proportion to what each
 * person logged against it. Rounded to the cent, with the last share taking
 * the remainder, so the shares always add back up to the gap exactly —
 * a column of people's shares that did not sum to the total would be a
 * second, wrong total.
 */
export function shareOfGap(
  gap: Prisma.Decimal,
  logged: Array<{ userId: string; amount: Prisma.Decimal | number | string }>,
): Map<string, Prisma.Decimal> {
  const byUser = new Map<string, Prisma.Decimal>();
  for (const line of logged) {
    byUser.set(line.userId, (byUser.get(line.userId) ?? ZERO).plus(new Prisma.Decimal(line.amount)));
  }
  const users = [...byUser.keys()].sort();
  const total = users.reduce((sum, userId) => sum.plus(byUser.get(userId)!), ZERO);
  const shares = new Map<string, Prisma.Decimal>();
  if (total.isZero()) return shares;

  let allocated = ZERO;
  users.forEach((userId, index) => {
    const share =
      index === users.length - 1
        ? gap.minus(allocated)
        : gap.times(byUser.get(userId)!).dividedBy(total).toDecimalPlaces(2);
    allocated = allocated.plus(share);
    shares.set(userId, share);
  });
  return shares;
}

// ─── The finance overview ───────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** The project filter's word for "money that belongs to no project". */
export const NO_PROJECT = "none";

export type FinanceScope = {
  companyId: string;
  /** The first day of the period, as the UTC midnight a daily log is keyed on. */
  from: Date;
  /** The last day of the period, inclusive, in the same terms. */
  to: Date;
  /** One project, `NO_PROJECT` for money that belongs to none, or everything. */
  projectId?: string | null;
  /** One person's money, or everybody's. */
  userId?: string | null;
  /** Which currency to add up. Defaults to the one most of the money is in. */
  currency?: string | null;
  /**
   * Who is looking. Their own requests are waiting on somebody else — nobody
   * approves their own — so they are not counted as waiting on them, which is
   * what keeps the count equal to the "Waiting on me" queue it links to.
   */
  viewerId?: string | null;
};

const REQUISITION_SELECT = {
  id: true,
  requisitionNo: true,
  status: true,
  category: true,
  purpose: true,
  amount: true,
  approvedAmount: true,
  acquittedAmount: true,
  currency: true,
  createdAt: true,
  submittedAt: true,
  approvedAt: true,
  disbursedAt: true,
  requestedBy: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, projectNo: true } },
} satisfies Prisma.CrmRequisitionSelect;

export type FinanceRequisition = Prisma.CrmRequisitionGetPayload<{ select: typeof REQUISITION_SELECT }>;

export type NeedsActionKind = "awaiting-approval" | "not-receipted" | "no-receipt" | "over-budget";

export type NeedsAction = { kind: NeedsActionKind; count: number; amount: Prisma.Decimal | null };

export type ProjectStanding = {
  project: { id: string; name: string; projectNo: string; status: string };
  budget: Prisma.Decimal | null;
  committed: Prisma.Decimal;
  spent: Prisma.Decimal;
  received: Prisma.Decimal;
  remaining: Prisma.Decimal | null;
  overBudget: boolean;
  requisitions: FinanceRequisition[];
};

export type PersonStanding = {
  person: { id: string; name: string | null };
  requested: Prisma.Decimal;
  approved: Prisma.Decimal;
  floatHeld: Prisma.Decimal;
  spent: Prisma.Decimal;
  unreceipted: Prisma.Decimal;
  requisitions: FinanceRequisition[];
};

export type FinanceOverview = {
  currency: string;
  /** Every currency money in scope is in, so a page can offer the others. */
  currencies: string[];
  /** At most four, in the order they should be dealt with. Zero counts included. */
  needsAction: NeedsAction[];
  /** Customer payments receipted in the period. */
  moneyIn: { total: Prisma.Decimal; receipts: number };
  /**
   * Money that left the business in the period: requisitions paid out, and
   * spend that came out of nobody's float. A line spent out of a float is
   * already inside the requisition's payment, so it is never added again.
   */
  moneyOut: { total: Prisma.Decimal; requisitions: Prisma.Decimal; direct: Prisma.Decimal };
  /** Right now: what open invoices still owe. */
  owedToUs: { total: Prisma.Decimal; invoices: number };
  /** Right now: money paid out and not yet accounted for. */
  floatsOut: { total: Prisma.Decimal; requisitions: number };
  /** Right now: approved and not yet paid — next week's claim on the bank. */
  committedUnpaid: { total: Prisma.Decimal; requisitions: number };
  byProject: ProjectStanding[];
  byPerson: PersonStanding[];
};

function money(value: Prisma.Decimal | number | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0).toDecimalPlaces(2);
}

/** The currency most of the rows are in; the first one alphabetically on a tie. */
function commonest(currencies: string[]): string | null {
  const tally = new Map<string, number>();
  for (const currency of currencies) tally.set(currency, (tally.get(currency) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

/**
 * The finance dashboard, for people who are not accountants.
 *
 * Two kinds of figure, and every one says which it is. **Flows** belong to
 * the period — money in, money out, what was asked for and spent in it.
 * **Positions** are as they stand right now, whatever the period — what is
 * owed to us, what is out on floats, what is approved and unpaid — because
 * "the floats we had out last March" is not a question anybody asks.
 *
 * The project and person filters narrow both. A person's money is what they
 * asked for and spent; money in belongs to whoever owns the deal it came from.
 *
 * Money is added up in one currency at a time. A total of dollars and ZiG is
 * not a figure, so rows in other currencies are left out and the page offers
 * them as a choice instead.
 *
 * Read-only: nothing here writes, reserves or posts.
 */
export async function financeOverview(tx: Tx, scope: FinanceScope): Promise<FinanceOverview> {
  const { companyId, from, to } = scope;
  const periodEnd = new Date(to.getTime() + DAY_MS);
  const inPeriod = (date: Date | null) => date !== null && date >= from && date < periodEnd;

  const projectFilter =
    scope.projectId === NO_PROJECT
      ? { projectId: null }
      : scope.projectId
        ? { projectId: scope.projectId }
        : {};

  // Every requisition the page could need: the open ones, and any that moved
  // in the period. Nothing older is read.
  const requisitions = await tx.crmRequisition.findMany({
    where: {
      companyId,
      ...projectFilter,
      ...(scope.userId ? { requestedById: scope.userId } : {}),
      OR: [
        { status: { in: ["SUBMITTED", "APPROVED", "DISBURSED"] } },
        { submittedAt: { gte: from, lt: periodEnd } },
        { approvedAt: { gte: from, lt: periodEnd } },
        { disbursedAt: { gte: from, lt: periodEnd } },
      ],
    },
    select: REQUISITION_SELECT,
    orderBy: { createdAt: "desc" },
  });

  const entries = await tx.crmDailyCostEntry.findMany({
    where: {
      companyId,
      ...projectFilter,
      log: { logDate: { gte: from, lte: to }, ...(scope.userId ? { userId: scope.userId } : {}) },
    },
    select: {
      direction: true,
      amount: true,
      currency: true,
      projectId: true,
      requisitionId: true,
      receiptUrl: true,
      log: { select: { user: { select: { id: true, name: true } } } },
    },
  });

  // The CRM's invoices: which project and whose deal each one is, what it
  // still owes, and what was receipted on it in the period.
  const documents = await tx.crmLeadDocument.findMany({
    where: { companyId, type: "INVOICE", invoiceId: { not: null } },
    select: {
      id: true,
      deal: { select: { assignedToId: true, projects: { select: { id: true }, take: 1 } } },
      lead: { select: { assignedToId: true } },
      invoice: {
        select: {
          currency: true,
          status: true,
          total: true,
          amountPaid: true,
          creditTotal: true,
          writeOffTotal: true,
          receipts: { where: { receivedAt: { gte: from, lt: periodEnd } }, select: { amount: true } },
        },
      },
    },
  });
  const projectOfDocument = (document: (typeof documents)[number]) =>
    document.deal?.projects[0]?.id ?? null;
  const documentInScope = (document: (typeof documents)[number]) => {
    const projectId = projectOfDocument(document);
    if (scope.projectId === NO_PROJECT ? projectId !== null : scope.projectId && projectId !== scope.projectId) {
      return false;
    }
    const owner = document.deal?.assignedToId ?? document.lead?.assignedToId ?? null;
    return !scope.userId || owner === scope.userId;
  };
  const scopedDocuments = documents.filter(documentInScope);

  const currency =
    scope.currency ??
    commonest([
      ...requisitions.map((requisition) => requisition.currency),
      ...entries.map((entry) => entry.currency),
      ...scopedDocuments.map((document) => document.invoice!.currency),
    ]) ??
    "USD";
  const currencies = [
    ...new Set([
      currency,
      ...requisitions.map((requisition) => requisition.currency),
      ...entries.map((entry) => entry.currency),
      ...scopedDocuments.map((document) => document.invoice!.currency),
    ]),
  ].sort();

  const ours = requisitions.filter((requisition) => requisition.currency === currency);
  const ourEntries = entries.filter((entry) => entry.currency === currency);
  const ourDocuments = scopedDocuments.filter((document) => document.invoice!.currency === currency);

  // Cash logged against invoices and not receipted, shared among whoever
  // logged it, and narrowed to this page's project and person.
  const gaps = [...(await receiptGaps(tx, companyId)).values()].filter((gap) => gap.currency === currency);
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const collections = gaps.length
    ? await tx.crmDailyCostEntry.findMany({
        where: {
          companyId,
          direction: "RECEIVED",
          invoiceDocumentId: { in: gaps.map((gap) => gap.invoiceDocumentId) },
        },
        select: { invoiceDocumentId: true, amount: true, log: { select: { userId: true } } },
      })
    : [];
  const unreceiptedByPerson = new Map<string, Prisma.Decimal>();
  let unreceiptedTotal = ZERO;
  let unreceiptedInvoices = 0;
  for (const gap of gaps) {
    const document = documentById.get(gap.invoiceDocumentId);
    const projectId = document ? projectOfDocument(document) : null;
    if (scope.projectId === NO_PROJECT ? projectId !== null : scope.projectId && projectId !== scope.projectId) {
      continue;
    }
    const shares = shareOfGap(
      gap.unreceipted,
      collections
        .filter((line) => line.invoiceDocumentId === gap.invoiceDocumentId)
        .map((line) => ({ userId: line.log.userId, amount: line.amount })),
    );
    let counted = false;
    for (const [userId, share] of shares) {
      if (scope.userId && userId !== scope.userId) continue;
      unreceiptedByPerson.set(userId, (unreceiptedByPerson.get(userId) ?? ZERO).plus(share));
      unreceiptedTotal = unreceiptedTotal.plus(share);
      counted = true;
    }
    if (counted) unreceiptedInvoices += 1;
  }

  // ── Flows in the period ──
  let moneyIn = ZERO;
  let receiptCount = 0;
  for (const document of ourDocuments) {
    for (const receipt of document.invoice!.receipts) {
      moneyIn = moneyIn.plus(money(receipt.amount));
      receiptCount += 1;
    }
  }

  const paidOut = ours.filter(
    (requisition) =>
      (requisition.status === "DISBURSED" || requisition.status === "ACQUITTED") &&
      inPeriod(requisition.disbursedAt),
  );
  const outOnRequisitions = paidOut.reduce((sum, requisition) => sum.plus(payableAmount(requisition)), ZERO);
  const direct = ourEntries
    .filter((entry) => entry.direction === "SPENT" && entry.requisitionId === null)
    .reduce((sum, entry) => sum.plus(entry.amount), ZERO);

  // ── Positions now ──
  let owed = ZERO;
  let owedInvoices = 0;
  for (const document of ourDocuments) {
    const invoice = document.invoice!;
    if (invoice.status !== "ISSUED") continue;
    const balance = money(invoice.total)
      .minus(money(invoice.amountPaid))
      .minus(money(invoice.creditTotal))
      .minus(money(invoice.writeOffTotal));
    if (balance.greaterThan(0)) {
      owed = owed.plus(balance);
      owedInvoices += 1;
    }
  }

  const disbursed = ours.filter((requisition) => requisition.status === "DISBURSED");
  const approvedUnpaid = ours.filter((requisition) => requisition.status === "APPROVED");
  const waiting = ours.filter(
    (requisition) => requisition.status === "SUBMITTED" && requisition.requestedBy.id !== scope.viewerId,
  );

  // ── Projects ──
  const overBudget = new Set(await overBudgetProjectIds(tx, companyId));
  const touched = new Set<string>();
  for (const requisition of ours) if (requisition.project) touched.add(requisition.project.id);
  for (const entry of ourEntries) if (entry.projectId) touched.add(entry.projectId);
  for (const document of ourDocuments) {
    const projectId = projectOfDocument(document);
    if (projectId && document.invoice!.receipts.length > 0) touched.add(projectId);
  }

  const projects =
    scope.projectId === NO_PROJECT
      ? []
      : await tx.crmProject.findMany({
          where: {
            companyId,
            currency,
            ...(scope.projectId
              ? { id: scope.projectId }
              : scope.userId
                ? { OR: [{ id: { in: [...touched] } }, { managerId: scope.userId }] }
                : { OR: [{ id: { in: [...touched] } }, { status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } }] }),
          },
          select: { id: true, name: true, projectNo: true, status: true, managerId: true },
        });

  const byProject: ProjectStanding[] = await Promise.all(
    projects.map(async (project) => {
      const costs = await projectCostSummary(tx, companyId, project.id);
      return {
        project: { id: project.id, name: project.name, projectNo: project.projectNo, status: project.status },
        budget: costs.budget,
        committed: costs.committed,
        spent: costs.spent,
        received: costs.received,
        remaining: costs.remaining,
        overBudget: overBudget.has(project.id),
        requisitions: ours.filter((requisition) => requisition.project?.id === project.id),
      };
    }),
  );
  // Over budget first — that is the row somebody has to do something about —
  // then the biggest commitments.
  byProject.sort(
    (a, b) =>
      Number(b.overBudget) - Number(a.overBudget) ||
      b.committed.comparedTo(a.committed) ||
      a.project.name.localeCompare(b.project.name),
  );

  const overBudgetInScope = scope.userId
    ? projects.filter((project) => project.managerId === scope.userId && overBudget.has(project.id)).length
    : scope.projectId === NO_PROJECT
      ? 0
      : scope.projectId
        ? Number(overBudget.has(scope.projectId))
        : overBudget.size;

  // ── People ──
  const people = new Map<string, { id: string; name: string | null }>();
  for (const requisition of ours) people.set(requisition.requestedBy.id, requisition.requestedBy);
  for (const entry of ourEntries) people.set(entry.log.user.id, entry.log.user);
  const unnamed = [...unreceiptedByPerson.keys()].filter((userId) => !people.has(userId));
  if (unnamed.length) {
    const users = await tx.user.findMany({
      where: { companyId, id: { in: unnamed } },
      select: { id: true, name: true },
    });
    for (const user of users) people.set(user.id, user);
  }

  const byPerson: PersonStanding[] = [...people.values()].map((person) => {
    const theirs = ours.filter((requisition) => requisition.requestedBy.id === person.id);
    return {
      person,
      requested: theirs
        .filter((requisition) => inPeriod(requisition.submittedAt))
        .reduce((sum, requisition) => sum.plus(requisition.amount), ZERO),
      approved: theirs
        .filter(
          (requisition) =>
            ["APPROVED", "DISBURSED", "ACQUITTED"].includes(requisition.status) &&
            inPeriod(requisition.approvedAt),
        )
        .reduce((sum, requisition) => sum.plus(payableAmount(requisition)), ZERO),
      floatHeld: theirs
        .filter((requisition) => requisition.status === "DISBURSED")
        .reduce((sum, requisition) => sum.plus(outstandingFloat(requisition)), ZERO),
      spent: ourEntries
        .filter((entry) => entry.direction === "SPENT" && entry.log.user.id === person.id)
        .reduce((sum, entry) => sum.plus(entry.amount), ZERO),
      unreceipted: unreceiptedByPerson.get(person.id) ?? ZERO,
      requisitions: theirs,
    };
  });
  // Whoever is holding the most money first.
  byPerson.sort(
    (a, b) =>
      b.floatHeld.plus(b.unreceipted).comparedTo(a.floatHeld.plus(a.unreceipted)) ||
      b.spent.comparedTo(a.spent) ||
      (a.person.name ?? "").localeCompare(b.person.name ?? ""),
  );

  const unphotographed = ourEntries.filter((entry) => entry.direction === "SPENT" && !entry.receiptUrl);

  return {
    currency,
    currencies,
    needsAction: [
      {
        kind: "awaiting-approval",
        count: waiting.length,
        amount: waiting.reduce((sum, requisition) => sum.plus(requisition.amount), ZERO),
      },
      { kind: "not-receipted", count: unreceiptedInvoices, amount: unreceiptedTotal },
      {
        kind: "no-receipt",
        count: unphotographed.length,
        amount: unphotographed.reduce((sum, entry) => sum.plus(entry.amount), ZERO),
      },
      { kind: "over-budget", count: overBudgetInScope, amount: null },
    ],
    moneyIn: { total: moneyIn, receipts: receiptCount },
    moneyOut: { total: outOnRequisitions.plus(direct), requisitions: outOnRequisitions, direct },
    owedToUs: { total: owed, invoices: owedInvoices },
    floatsOut: {
      total: disbursed.reduce((sum, requisition) => sum.plus(outstandingFloat(requisition)), ZERO),
      requisitions: disbursed.length,
    },
    committedUnpaid: {
      total: approvedUnpaid.reduce((sum, requisition) => sum.plus(payableAmount(requisition)), ZERO),
      requisitions: approvedUnpaid.length,
    },
    byProject,
    byPerson,
  };
}
