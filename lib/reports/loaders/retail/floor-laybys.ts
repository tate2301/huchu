import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow } from "@/lib/reports/types";
import { laybyWhat } from "@/lib/retail/floor/layby-words";
import { siteScopeOf } from "@/lib/retail/people/scope";
import { loadTillRules } from "@/lib/retail/till-rules";
import { LAYBY_DUE_SOON_DAYS, laybyStateLabel, laybyStateTone, tenderLabel } from "@/lib/retail/words";
import { addDays, formatMediumDay, todayIn } from "@/lib/workspace/format";

/**
 * Lay-bys (FLR-06, `retail-laybys`): every lay-by of the shop, read in memory
 * (a shop keeps tens, not thousands). The tabs part them by status; the state
 * says how its due day stands; what is left and what a cancel would pay back
 * ride on the row for the menu's asks.
 */

const isId = (value: string | undefined) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

async function sitesIn(ctx: ReportContext): Promise<string[] | null> {
  const scope = await siteScopeOf(ctx.companyId, ctx.userId);
  return scope.all ? null : scope.ids;
}

/** Where the due day stands, for the State filter: on time, within a week, overdue; nothing once done. */
function timing(status: string, dueOn: string, today: string): string | null {
  if (status === "READY") return "on-time";
  if (status !== "PAYING") return null;
  if (dueOn < today) return "overdue";
  return dueOn <= addDays(today, LAYBY_DUE_SOON_DAYS) ? "soon" : "on-time";
}

async function loadLaybys(ctx: ReportContext, params: ReportParams) {
  const now = new Date();
  const today = todayIn(undefined, now);
  const [siteIds, rules] = await Promise.all([sitesIn(ctx), loadTillRules(ctx.companyId)]);
  const laybys = await prisma.retailLayby.findMany({
    where: {
      companyId: ctx.companyId,
      ...(siteIds ? { siteId: { in: siteIds } } : {}),
      ...(isId(params.customer) ? { customerId: params.customer } : {}),
    },
    orderBy: [{ dueOn: "asc" }, { laybyNo: "asc" }],
    select: {
      id: true,
      laybyNo: true,
      status: true,
      total: true,
      paid: true,
      dueOn: true,
      createdAt: true,
      siteId: true,
      site: { select: { name: true } },
      customer: { select: { id: true, name: true } },
      lines: { orderBy: { createdAt: "asc" }, select: { itemName: true, quantity: true } },
      payments: { orderBy: { createdAt: "desc" }, where: { kind: { not: "REFUND" } }, take: 1, select: { tenderType: true } },
    },
  });
  return result(
    laybys.map((layby): ReportRow => {
      const dueOn = layby.dueOn.toISOString().slice(0, 10);
      const state = laybyStateLabel({ status: layby.status, dueOn }, today);
      const paid = money(layby.paid);
      const fee = money(rules.laybyCancelFee).greaterThan(paid) ? paid : money(rules.laybyCancelFee);
      const lines = layby.lines.map((line) => ({ name: line.itemName, quantity: line.quantity.toNumber() }));
      const lastTender = layby.payments[0]?.tenderType ?? "CASH";
      const backTender = lastTender === "ECOCASH" || lastTender === "CARD" ? lastTender : "CASH";
      return {
        id: layby.id,
        laybyNo: layby.laybyNo,
        customer: layby.customer.name,
        customerId: layby.customer.id,
        what: laybyWhat(lines),
        total: money(layby.total).toNumber(),
        paid: paid.toNumber(),
        left: money(layby.total).minus(paid).toNumber(),
        dueOn: layby.status === "PAYING" ? dueOn : layby.status === "READY" ? today : null,
        dueText: layby.status === "PAYING" ? formatMediumDay(`${dueOn}T12:00:00Z`) : layby.status === "READY" ? "Any time" : "—",
        statusKey: layby.status,
        state,
        stateTone: laybyStateTone(state),
        timing: timing(layby.status, dueOn, today),
        siteId: layby.siteId,
        site: layby.site.name,
        startedAt: layby.createdAt.toISOString(),
        // What a cancel would do, for its ask.
        backTender,
        backBy: tenderLabel(backTender),
        cancelFee: fee.toNumber(),
        paidBack: paid.minus(fee).toNumber(),
        many: lines.length > 1 || lines.some((line) => line.quantity > 1) ? "yes" : "no",
      };
    }),
  );
}

async function laybyOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const siteIds = await sitesIn(ctx);
  const sites = await prisma.site.findMany({
    where: { companyId: ctx.companyId, isActive: true, ...(siteIds ? { id: { in: siteIds } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { site: sites.map((site) => ({ value: site.id, label: site.name })) };
}

async function customerName(ctx: ReportContext, filters: Record<string, string>) {
  if (!isId(filters.customer)) return null;
  const customer = await prisma.customer.findFirst({ where: { id: filters.customer, companyId: ctx.companyId }, select: { name: true } });
  return customer?.name ?? null;
}

export const FLOOR_LAYBY_LOADERS: Record<string, ReportLoader> = {
  "retail-laybys": { load: loadLaybys, options: laybyOptions, parentLabel: customerName },
};
