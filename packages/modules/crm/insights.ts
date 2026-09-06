/**
 * CRM insights aggregations. All queries are company-scoped and optionally
 * rep-scoped. Returns plain numbers ready for charts.
 */
import type { CrmLeadStage } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { CRM_LEAD_STAGES, CRM_STAGE_LABELS } from "./pipeline";

type Range = { from?: Date; to?: Date };

function createdAtFilter(range: Range) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

export async function getFunnel(companyId: string, opts: Range & { repId?: string | null }) {
  const where = {
    companyId,
    ...(opts.repId ? { assignedToId: opts.repId } : {}),
    ...(createdAtFilter(opts) ? { createdAt: createdAtFilter(opts) } : {}),
  };
  const grouped = await prisma.crmLead.groupBy({
    by: ["stage"],
    where,
    _count: { _all: true },
  });
  const counts = new Map<CrmLeadStage, number>(grouped.map((g) => [g.stage, g._count._all]));
  const total = grouped.reduce((s, g) => s + g._count._all, 0);
  const won = counts.get("WON") ?? 0;

  return {
    total,
    won,
    winRate: total > 0 ? Math.round((won / total) * 1000) / 10 : 0,
    stages: CRM_LEAD_STAGES.map((stage) => ({
      stage,
      label: CRM_STAGE_LABELS[stage],
      count: counts.get(stage) ?? 0,
    })),
  };
}

export async function getPipelineValue(companyId: string, opts: { repId?: string | null }) {
  const leads = await prisma.crmLead.findMany({
    where: {
      companyId,
      ...(opts.repId ? { assignedToId: opts.repId } : {}),
      stage: { notIn: ["WON", "LOST"] },
    },
    select: { stage: true, estimatedValue: true },
  });

  // No weighted figure here. It used to count a lead with no probability set
  // as worth nothing, which meant the weighted total fell as the pipeline
  // filled up — the opposite of what it appeared to say. `forecast()` in
  // reports.ts does the weighting properly, with a stated default and a count
  // of how many rows are relying on it.
  let gross = 0;
  for (const lead of leads) {
    gross += lead.estimatedValue ?? 0;
  }
  return { openLeads: leads.length, grossValue: Math.round(gross * 100) / 100 };
}

export async function getSourceAttribution(companyId: string, opts: Range) {
  const where = {
    companyId,
    ...(createdAtFilter(opts) ? { createdAt: createdAtFilter(opts) } : {}),
  };
  const grouped = await prisma.crmLead.groupBy({
    by: ["source", "sourceChannel", "utmSource", "utmCampaign", "stage"],
    where,
    _count: { _all: true },
  });

  const byKey = new Map<
    string,
    { source: string; channel: string; campaign: string | null; leads: number; won: number }
  >();
  const byChannel = new Map<string, { channel: string; leads: number; won: number }>();

  for (const row of grouped) {
    const source = row.source ?? row.utmSource ?? "direct";
    const channel = row.sourceChannel;
    const key = `${channel}::${source}::${row.utmCampaign ?? ""}`;
    const entry = byKey.get(key) ?? { source, channel, campaign: row.utmCampaign, leads: 0, won: 0 };
    entry.leads += row._count._all;
    if (row.stage === "WON") entry.won += row._count._all;
    byKey.set(key, entry);

    const channelEntry = byChannel.get(channel) ?? { channel, leads: 0, won: 0 };
    channelEntry.leads += row._count._all;
    if (row.stage === "WON") channelEntry.won += row._count._all;
    byChannel.set(channel, channelEntry);
  }

  const withRate = <T extends { leads: number; won: number }>(e: T) => ({
    ...e,
    conversionRate: e.leads > 0 ? Math.round((e.won / e.leads) * 1000) / 10 : 0,
  });

  return {
    sources: Array.from(byKey.values()).map(withRate).sort((a, b) => b.leads - a.leads),
    channels: Array.from(byChannel.values()).map(withRate).sort((a, b) => b.leads - a.leads),
  };
}

export async function getRepPerformance(companyId: string, opts: Range & { repId?: string | null }) {
  const leadWhere = {
    companyId,
    assignedToId: opts.repId ? opts.repId : { not: null },
    ...(createdAtFilter(opts) ? { createdAt: createdAtFilter(opts) } : {}),
  };

  const leads = await prisma.crmLead.findMany({
    where: leadWhere,
    select: {
      assignedToId: true,
      stage: true,
      createdAt: true,
      firstContactAt: true,
      assignedTo: { select: { name: true } },
      documents: { select: { type: true, amount: true } },
    },
  });

  type RepAgg = {
    repId: string;
    name: string;
    leads: number;
    won: number;
    quotes: number;
    invoicedAmount: number;
    collectedAmount: number;
    responseTotalMs: number;
    responseCount: number;
  };
  const byRep = new Map<string, RepAgg>();

  for (const lead of leads) {
    const repId = lead.assignedToId as string;
    const agg =
      byRep.get(repId) ??
      {
        repId,
        name: lead.assignedTo?.name ?? "Unassigned",
        leads: 0,
        won: 0,
        quotes: 0,
        invoicedAmount: 0,
        collectedAmount: 0,
        responseTotalMs: 0,
        responseCount: 0,
      };
    agg.leads += 1;
    if (lead.stage === "WON") agg.won += 1;
    for (const doc of lead.documents) {
      if (doc.type === "QUOTATION") agg.quotes += 1;
      if (doc.type === "INVOICE") agg.invoicedAmount += doc.amount;
      if (doc.type === "RECEIPT") agg.collectedAmount += doc.amount;
    }
    if (lead.firstContactAt) {
      agg.responseTotalMs += lead.firstContactAt.getTime() - lead.createdAt.getTime();
      agg.responseCount += 1;
    }
    byRep.set(repId, agg);
  }

  return Array.from(byRep.values())
    .map((a) => ({
      repId: a.repId,
      name: a.name,
      leads: a.leads,
      quotes: a.quotes,
      won: a.won,
      winRate: a.leads > 0 ? Math.round((a.won / a.leads) * 1000) / 10 : 0,
      invoicedAmount: Math.round(a.invoicedAmount * 100) / 100,
      collectedAmount: Math.round(a.collectedAmount * 100) / 100,
      avgResponseHours:
        a.responseCount > 0
          ? Math.round((a.responseTotalMs / a.responseCount / 3_600_000) * 10) / 10
          : null,
    }))
    .sort((a, b) => b.collectedAmount - a.collectedAmount);
}
