import type { Vertical } from "@prisma/client";

import { readStanding, type Standing } from "@/lib/admin/standing";
import { BILLED_MEMBER, priceVerticals, VERTICAL_ORDER, VERTICALS } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";

/**
 * Money across every workspace, for Home.
 *
 * Every figure is read from the same rows: each workspace's standing and its
 * price today (its verticals at the rate its member count sets). The maths is
 * here as pure functions so it can be tested with exact figures; the loader
 * at the bottom is the only part that reads the database.
 *
 * - A workspace is **paying** when it stands Active or Past due: it has paid,
 *   and has not lapsed past its grace days.
 * - **Monthly recurring revenue** is what the paying workspaces' prices add up
 *   to a month.
 * - **Due this month** is what falls to be paid between now and the month's
 *   end: paying workspaces whose paid period ends then, and trials that end.
 * - **Past due** is the paying workspaces whose period has ended, inside grace.
 * - **At risk** is past due plus read-only: money a workspace was paying or
 *   about to pay, now waiting on them.
 * - The **12-month projection** has two lines. *Paid* counts a workspace in a
 *   month its payments already reach into. *Expected* assumes every paying
 *   workspace renews at today's price and every trial converts from the month
 *   it ends. Nobody's price is assumed to change.
 */

const DAY = 24 * 60 * 60 * 1000;

export type ProjectionRow = {
  id: string;
  standing: Standing;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  /** Its price a month today. */
  monthly: number;
  /** That price by vertical. */
  lines: Array<{ vertical: Vertical; amount: number }>;
};

export type Figure = { value: number; count: number };

export type HomeFigures = {
  mrr: Figure;
  dueThisMonth: Figure;
  pastDue: Figure;
  atRisk: Figure;
  renewals30: Figure;
  trialsEnding14: Figure;
};

export type ProjectionMonth = {
  /** The first day of the month, UTC. */
  monthStart: Date;
  paid: number;
  expected: number;
};

export type VerticalMix = { vertical: Vertical; label: string; workspaces: number; value: number };

const PAYING: ReadonlySet<Standing> = new Set(["Active", "Past due"]);

export const isPaying = (row: ProjectionRow) => PAYING.has(row.standing);

function sum(rows: ProjectionRow[]): Figure {
  return { value: rows.reduce((total, row) => total + row.monthly, 0), count: rows.length };
}

const within = (date: Date | null, from: Date, to: Date) => date !== null && date >= from && date < to;

/** The first moment of the month `offset` months after the one `date` is in, UTC. */
export function monthStart(date: Date, offset = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

export function homeFigures(rows: ProjectionRow[], now: Date): HomeFigures {
  const paying = rows.filter(isPaying);
  const trials = rows.filter((row) => row.standing === "Trial");
  const monthEnd = monthStart(now, 1);
  return {
    mrr: sum(paying),
    dueThisMonth: sum([
      ...paying.filter((row) => within(row.currentPeriodEnd, now, monthEnd)),
      ...trials.filter((row) => within(row.trialEndsAt, now, monthEnd)),
    ]),
    pastDue: sum(rows.filter((row) => row.standing === "Past due")),
    atRisk: sum(rows.filter((row) => row.standing === "Past due" || row.standing === "Read-only")),
    renewals30: sum(paying.filter((row) => within(row.currentPeriodEnd, now, new Date(now.getTime() + 30 * DAY)))),
    trialsEnding14: sum(trials.filter((row) => within(row.trialEndsAt, now, new Date(now.getTime() + 14 * DAY)))),
  };
}

/** Twelve months from this one: what is paid into each, and what is expected if everyone renews and trials convert. */
export function projectMonths(rows: ProjectionRow[], now: Date, months = 12): ProjectionMonth[] {
  const paying = rows.filter(isPaying);
  const trials = rows.filter((row) => row.standing === "Trial");
  const recurring = sum(paying).value;
  return Array.from({ length: months }, (_, index) => {
    const start = monthStart(now, index);
    const next = monthStart(now, index + 1);
    return {
      monthStart: start,
      paid: sum(paying.filter((row) => row.currentPeriodEnd !== null && row.currentPeriodEnd > start)).value,
      expected: recurring + sum(trials.filter((row) => row.trialEndsAt !== null && row.trialEndsAt < next)).value,
    };
  });
}

/** What the paying workspaces pay, by vertical, in the catalogue's order. */
export function mixByVertical(rows: ProjectionRow[]): VerticalMix[] {
  const paying = rows.filter(isPaying);
  return VERTICAL_ORDER.flatMap((vertical) => {
    const holding = paying.flatMap((row) => row.lines.filter((line) => line.vertical === vertical));
    if (holding.length === 0) return [];
    return [
      {
        vertical,
        label: VERTICALS[vertical].label,
        workspaces: holding.length,
        value: holding.reduce((total, line) => total + line.amount, 0),
      },
    ];
  });
}

/** Every workspace as a projection row: one query for the workspaces, one for their members. */
export async function loadProjectionRows(now = new Date()): Promise<ProjectionRow[]> {
  const [companies, members] = await Promise.all([
    prisma.company.findMany({
      select: {
        id: true,
        tenantStatus: true,
        verticals: { select: { vertical: true } },
        subscriptions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { status: true, trialEndsAt: true, currentPeriodEnd: true, plan: { select: { graceDays: true } } },
        },
      },
    }),
    prisma.user.groupBy({
      by: ["companyId"],
      where: BILLED_MEMBER,
      _count: { _all: true },
    }),
  ]);
  const membersOf = new Map(members.map((row) => [row.companyId, row._count._all]));
  return companies.map((company) => {
    const subscription = company.subscriptions[0] ?? null;
    const price = priceVerticals(
      company.verticals.map((row) => row.vertical),
      membersOf.get(company.id) ?? 0,
    );
    return {
      id: company.id,
      standing: readStanding(
        {
          tenantStatus: company.tenantStatus,
          subscription: subscription
            ? {
                status: subscription.status,
                trialEndsAt: subscription.trialEndsAt,
                currentPeriodEnd: subscription.currentPeriodEnd,
                graceDays: subscription.plan.graceDays,
              }
            : null,
        },
        now,
      ).standing,
      trialEndsAt: subscription?.trialEndsAt ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      monthly: price.total,
      lines: price.lines.map((line) => ({ vertical: line.vertical, amount: line.amount })),
    };
  });
}
