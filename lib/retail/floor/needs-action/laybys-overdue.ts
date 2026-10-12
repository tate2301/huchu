import { money, sumMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/workspace/format";

import type { NeedsActionProvider, NeedsActionRow } from "./types";
import { countTitle } from "./words";

/**
 * "Two lay-bys overdue" (50-floor §4.1 row 10, FLR-06): lay-bys still being
 * paid whose day has passed; the meta names the oldest, the figure is what is
 * left on all of them, and the row opens Lay-bys on its overdue ones.
 */
export function laybysOverdueRow(
  rows: Array<{ laybyNo: string; customer: string; left: number }>,
): NeedsActionRow | null {
  if (rows.length === 0) return null;
  const oldest = rows[0]!;
  return {
    key: "laybys-overdue",
    tone: "warn",
    title: `${countTitle(rows.length, "lay-by", "lay-bys")} overdue`,
    meta: `${oldest.laybyNo} · ${oldest.customer} · ${formatMoney(oldest.left)} left`,
    figure: formatMoney(sumMoney(rows.map((row) => row.left)).toNumber()),
    figureTone: "warn",
    href: "/retail/laybys?tab=paying&state=overdue",
  };
}

export const laybysOverdue: NeedsActionProvider = {
  key: "laybys-overdue",
  can: ["retail.laybys", "view"],
  load: async (ctx) => {
    const today = new Date(`${ctx.tomorrow}T00:00:00.000Z`);
    today.setUTCDate(today.getUTCDate() - 1);
    const overdue = await prisma.retailLayby.findMany({
      where: {
        companyId: ctx.companyId,
        ...(ctx.siteIds ? { siteId: { in: ctx.siteIds } } : {}),
        status: "PAYING",
        dueOn: { lt: today },
      },
      orderBy: [{ dueOn: "asc" }, { laybyNo: "asc" }],
      select: { laybyNo: true, total: true, paid: true, customer: { select: { name: true } } },
    });
    const row = laybysOverdueRow(
      overdue.map((layby) => ({ laybyNo: layby.laybyNo, customer: layby.customer.name, left: money(layby.total).minus(money(layby.paid)).toNumber() })),
    );
    return row ? [row] : [];
  },
};
