import "dotenv/config";

import type { Vertical } from "@prisma/client";

import { recomputeAndPersistCompanyPricing } from "@/lib/platform/entitlements";
import { billedMemberWhere, verticalCharge } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";

/**
 * Put every workspace's stored price on the vertical rule.
 *
 * `CompanySubscription.effectiveMonthlyAmount` is what lists and projections
 * read. It is rewritten whenever members or verticals change, but a workspace
 * nobody has touched since the rule changed still holds its old tier price.
 * This prices every workspace again and says which figures move.
 *
 * Dry run is the default and writes nothing.
 *
 *   pnpm tsx scripts/rollout/reprice-tenants.ts
 *   pnpm tsx scripts/rollout/reprice-tenants.ts --apply
 */

export type RepriceRow = {
  companyId: string;
  slug: string;
  /** What the subscription says now; null when never priced. */
  stored: number | null;
  verticals: Vertical[];
  members: number;
};

export type RepriceChange = { companyId: string; slug: string; from: number | null; to: number };

/** The workspaces whose stored price is not what the rule says, and what it should be. */
export function planReprice(rows: RepriceRow[]): RepriceChange[] {
  return rows.flatMap((row) => {
    const to = verticalCharge(new Set(row.verticals).size, row.members).total;
    return row.stored === to ? [] : [{ companyId: row.companyId, slug: row.slug, from: row.stored, to }];
  });
}

async function loadRows(): Promise<RepriceRow[]> {
  const companies = await prisma.company.findMany({
    where: { subscriptions: { some: {} } },
    select: {
      id: true,
      slug: true,
      verticals: { select: { vertical: true } },
      subscriptions: { orderBy: { updatedAt: "desc" }, take: 1, select: { effectiveMonthlyAmount: true } },
    },
    orderBy: { slug: "asc" },
  });
  return Promise.all(
    companies.map(async (company) => ({
      companyId: company.id,
      slug: company.slug,
      stored: company.subscriptions[0]?.effectiveMonthlyAmount ?? null,
      verticals: company.verticals.map((row) => row.vertical),
      members: await prisma.user.count({ where: billedMemberWhere(company.id) }),
    })),
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const changes = planReprice(await loadRows());
  for (const change of changes) {
    console.log(`${change.slug}: ${change.from === null ? "unpriced" : `$${change.from}`} -> $${change.to}`);
    if (apply) await recomputeAndPersistCompanyPricing(change.companyId);
  }
  console.log(`${changes.length} ${changes.length === 1 ? "workspace" : "workspaces"} ${apply ? "repriced" : "would be repriced (dry run; --apply to write)"}.`);
}

if ((process.argv[1] ?? "").endsWith("reprice-tenants.ts")) {
  main()
    .catch((error) => {
      console.error("[rollout/reprice-tenants] failed:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
