/**
 * Posting a payroll run to the ledger — when there is a ledger.
 *
 * Two jobs, and the second is the interesting one.
 *
 * **Summarising.** A run's `PayrollLineComponent` rows carry a `statutoryKey`,
 * and the ledger wants them summed one authority at a time. Doing it here rather
 * than in the posting engine means the P2 in `lib/hr/returns/` and the journal
 * are summed from the same rows by the same code — which is what makes a return
 * reconcilable against its payable balance instead of merely similar to it.
 *
 * **The accounting seam.** Payroll must work in a workspace with no accounting
 * module at all; that is the point of the payroll-only product. So posting is
 * optional. When `accounting.core` is off the run completes, posts nothing, and
 * **records that it posted nothing** — the third option, silently pretending it
 * posted, is the one that loses money, because the first person to notice is
 * whoever tries to reconcile a payable balance that was never written.
 */

import type { Prisma } from "@corelithzw/db";

import { createJournalEntryFromSource, type StatutoryPostingBasis } from "@corelithzw/module-books/posting";
import { hasEnabledFeature } from "@corelithzw/platform/gating/enforcer";
import {
  clampAtZero,
  resolveBaseCurrency,
  sumMoney,
  toBaseAmount,
  ZERO,
} from "@corelithzw/platform/money";
import { prisma } from "@corelithzw/db/client";

/**
 * `statutoryKey` on a component to the `PostingBasis` it feeds.
 *
 * A key with no entry here is not a statutory line and falls into
 * `OTHER_DEDUCTIONS` or is ignored, depending on its type — so a company that
 * invents a key does not silently disappear from the journal.
 */
const KEY_TO_BASIS: Record<string, StatutoryPostingBasis> = {
  PAYE: "PAYE",
  AIDS_LEVY: "AIDS_LEVY",
  NSSA_POBS_EMPLOYEE: "NSSA_EMPLOYEE",
  NSSA_POBS_EMPLOYER: "NSSA_EMPLOYER",
  NSSA_APWCS: "NSSA_EMPLOYER",
  ZIMDEF: "ZIMDEF",
  STANDARDS_DEVELOPMENT_LEVY: "STANDARDS_DEVELOPMENT_LEVY",
  NEC_EMPLOYEE: "NEC_EMPLOYEE",
  NEC_EMPLOYER: "NEC_EMPLOYER",
};

export type StatutoryBreakdown = Partial<Record<StatutoryPostingBasis, Prisma.Decimal>>;

type ComponentForSummary = {
  type: string;
  amount: Prisma.Decimal;
  statutoryKey: string | null;
};

/**
 * Sum a set of components into the bases the posting rule reads.
 *
 * Pure, so it can be tested against a hand-built component list, and so the
 * returns can reuse it.
 *
 * Tax credits are deliberately excluded. A credit reduces PAYE before the levy
 * is struck, and the engine has already applied it — `slice.paye` is the
 * post-credit figure. Adding the credit rows here would double-count the
 * reduction and leave the journal short.
 */
export function summariseStatutory(
  components: ComponentForSummary[],
): StatutoryBreakdown {
  const buckets = new Map<StatutoryPostingBasis, Prisma.Decimal[]>();
  const push = (basis: StatutoryPostingBasis, amount: Prisma.Decimal) => {
    const existing = buckets.get(basis);
    if (existing) existing.push(amount);
    else buckets.set(basis, [amount]);
  };

  for (const component of components) {
    // A credit is recorded as an ALLOWANCE for the payslip's sake but is not
    // money moving, so it must not reach the ledger.
    if (component.statutoryKey?.startsWith("TAX_CREDIT_")) continue;
    if (component.statutoryKey === "BONUS_EXEMPTION") continue;

    if (component.type === "EMPLOYER_CONTRIBUTION") {
      const basis = component.statutoryKey
        ? KEY_TO_BASIS[component.statutoryKey]
        : undefined;
      // Every employer contribution also lands in the aggregate, which is what
      // the single expense debit is struck on.
      push("EMPLOYER_CONTRIBUTIONS", component.amount);
      if (basis) push(basis, component.amount);
      continue;
    }

    if (component.type === "STATUTORY_DEDUCTION") {
      const basis = component.statutoryKey
        ? KEY_TO_BASIS[component.statutoryKey]
        : undefined;
      // An unrecognised statutory key still has to be credited somewhere, or the
      // entry would not balance — so it falls in with the other deductions
      // rather than vanishing.
      push(basis ?? "OTHER_DEDUCTIONS", component.amount);
      continue;
    }

    if (component.type === "DEDUCTION") {
      push("OTHER_DEDUCTIONS", component.amount);
    }
  }

  const breakdown: StatutoryBreakdown = {};
  for (const [basis, amounts] of buckets) {
    breakdown[basis] = sumMoney(amounts);
  }
  return breakdown;
}

export type PayrollPostingOutcome =
  | { posted: true; entryId: string }
  | { posted: false; reason: string };

/**
 * Post an approved run, if this workspace keeps a ledger.
 *
 * Returns the outcome rather than throwing, so the caller can stamp it on the
 * run. A failure to post is not a failure to pay people.
 */
export async function postPayrollRun(input: {
  companyId: string;
  runId: string;
  runNumber: number;
  entryDate: Date;
  createdById: string;
  enabledFeatures: string[] | undefined;
  actorRole?: string | null;
}): Promise<PayrollPostingOutcome> {
  if (!hasEnabledFeature(input.enabledFeatures, "accounting.core")) {
    // The payroll-only product. Nothing to post to, and saying so is the point.
    return {
      posted: false,
      reason: "No accounting module on this workspace — the run was not posted to a ledger.",
    };
  }

  const lines = await prisma.payrollLineItem.findMany({
    where: { runId: input.runId },
    select: {
      currency: true,
      exchangeRate: true,
      grossAmount: true,
      netAmount: true,
      allowancesTotal: true,
      deductionsTotal: true,
      employerCost: true,
      components: {
        select: { type: true, amount: true, statutoryKey: true },
      },
    },
  });

  if (lines.length === 0) {
    return { posted: false, reason: "The run has no line items to post." };
  }

  const baseCurrency = await resolveBaseCurrency(input.companyId);

  // ── One entry, in base currency.
  //
  // Not one per currency: `JournalEntry` is unique on
  // (companyId, sourceType, sourceId), so two entries for one run would collide,
  // and it carries no currency column of its own. The repo's convention — the
  // reason `apportionBase` exists — is that the ledger is kept in base currency
  // and each document holds its own currency plus a converted amount. Payroll
  // follows it: a ZWG line converts through the rate frozen on that line when the
  // run was computed, so a reprint next year and this journal still agree.
  //
  // Balance is achieved the way `apportionBase` insists on: **one side is
  // converted and the other is the remainder.** Gross and every deduction are
  // converted; net is then `gross − deductions` rather than a third independent
  // conversion. Two independent conversions of 100 ZWG at 3.00 give 33.33 and a
  // 50/50 split gives 33.34 — a cent that a journal entry refuses over.
  const perLine = lines.map((line) => {
    const rate = line.exchangeRate;
    const statutory = summariseStatutory(line.components);
    const converted: StatutoryBreakdown = {};
    for (const [basis, amount] of Object.entries(statutory)) {
      converted[basis as StatutoryPostingBasis] = toBaseAmount(amount, rate);
    }
    return {
      baseGross: toBaseAmount(line.grossAmount, rate),
      baseAllowances: toBaseAmount(line.allowancesTotal, rate),
      statutory: converted,
    };
  });

  const grossAmount = sumMoney(perLine.map((line) => line.baseGross));
  const allowancesAmount = sumMoney(perLine.map((line) => line.baseAllowances));

  const statutory: StatutoryBreakdown = {};
  for (const line of perLine) {
    for (const [basis, amount] of Object.entries(line.statutory)) {
      const key = basis as StatutoryPostingBasis;
      statutory[key] = sumMoney([statutory[key] ?? ZERO, amount]);
    }
  }

  // The credits that come out of the wage. Net is what is left of gross after
  // them — derived, never converted independently.
  const EMPLOYEE_BASES: StatutoryPostingBasis[] = [
    "PAYE",
    "AIDS_LEVY",
    "NSSA_EMPLOYEE",
    "NEC_EMPLOYEE",
    "OTHER_DEDUCTIONS",
  ];
  const deductionsAmount = sumMoney(
    EMPLOYEE_BASES.map((basis) => statutory[basis] ?? ZERO),
  );
  const netAmount = clampAtZero(grossAmount.minus(deductionsAmount));

  // Likewise the employer's expense debit is the sum of its own credits, so the
  // two sides of that half of the entry cannot drift apart either.
  const EMPLOYER_BASES: StatutoryPostingBasis[] = [
    "NSSA_EMPLOYER",
    "ZIMDEF",
    "STANDARDS_DEVELOPMENT_LEVY",
    "NEC_EMPLOYER",
  ];
  statutory.EMPLOYER_CONTRIBUTIONS = sumMoney(
    EMPLOYER_BASES.map((basis) => statutory[basis] ?? ZERO),
  );

  const result = await createJournalEntryFromSource({
    companyId: input.companyId,
    sourceType: "PAYROLL_RUN",
    sourceId: input.runId,
    causationKey: `payroll-run:${input.runId}`,
    entryDate: input.entryDate,
    description: `Payroll run #${input.runNumber}`,
    createdById: input.createdById,
    // The ledger's own currency, since that is what these figures are in now.
    currency: baseCurrency,
    amount: netAmount,
    netAmount,
    grossAmount,
    deductionsAmount,
    allowancesAmount,
    taxAmount: statutory.PAYE ?? ZERO,
    statutory,
    actorRole: input.actorRole ?? undefined,
  });

  if (result.entryId) return { posted: true, entryId: result.entryId };
  return {
    posted: false,
    reason: result.error ?? "The ledger declined the entry.",
  };
}

/** Net pay in base currency, for a run's own reporting. */
export function runNetInBase(
  lines: Array<{ netAmount: Prisma.Decimal; exchangeRate: Prisma.Decimal }>,
) {
  return sumMoney(lines.map((line) => toBaseAmount(line.netAmount, line.exchangeRate)));
}
