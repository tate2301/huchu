import type { CrmLeadChannel, CrmLeadStage, Prisma } from "@prisma/client";

import { LEAD_CHANNEL_OPTIONS, LEAD_STAGE_OPTIONS, optionLabel } from "@/lib/crm/record-labels";
import { prisma } from "@/lib/prisma";

import { LEAD_REGISTER } from "../defs/lead";
import type { ViewState } from "../types";
import {
  NO_GROUP,
  byRelation,
  countsBy,
  dayCell,
  distinctText,
  minuteCell,
  nullsLast,
  prismaRegister,
} from "./prisma-register";
import type { RegisterContext } from "./types";
import {
  archivedClause,
  contains,
  customFieldClauses,
  dateClause,
  groupClause,
  listValues,
  numberClause,
  ownerClause,
  searchClause,
} from "./where";

const include = {
  client: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  // Past Contacted an enquiry has become a deal; the board opens the deal and
  // shows its figure rather than the lead it grew out of.
  convertedDeal: { select: { id: true, dealNo: true, value: true } },
  // The next thing owed on the lead, so nothing quietly goes cold.
  followUps: {
    where: { status: "PENDING" },
    orderBy: { dueAt: "asc" },
    take: 1,
    select: { id: true, title: true, dueAt: true },
  },
} satisfies Prisma.CrmLeadInclude;

type LeadRecord = Prisma.CrmLeadGetPayload<{ include: typeof include }>;

export type LeadRow = Omit<LeadRecord, "followUps" | "convertedDeal"> & {
  nextFollowUp: LeadRecord["followUps"][number] | null;
  deal: LeadRecord["convertedDeal"];
  /** When the lead reached its stage: its latest stage change, or when it arrived. */
  stageEnteredAt: Date;
};

/**
 * The rows as the list, the board and the export read them. How long a lead
 * has sat in its stage comes from its latest stage change — leads have no
 * column for it — so it is read for the rows in hand, never the whole table.
 */
async function shape(records: LeadRecord[]): Promise<LeadRow[]> {
  if (records.length === 0) return [];
  const changes = await prisma.crmActivity.findMany({
    where: { type: "STAGE_CHANGE", leadId: { in: records.map((record) => record.id) } },
    select: { leadId: true, occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });
  const entered = new Map<string, Date>();
  for (const change of changes) {
    if (change.leadId && !entered.has(change.leadId)) entered.set(change.leadId, change.occurredAt);
  }
  return records.map(({ followUps, convertedDeal, ...lead }) => ({
    ...lead,
    nextFollowUp: followUps[0] ?? null,
    deal: convertedDeal,
    stageEnteredAt: entered.get(lead.id) ?? lead.createdAt,
  }));
}

async function where(ctx: RegisterContext, state: ViewState): Promise<Prisma.CrmLeadWhereInput> {
  const f = state.filters;
  const and: Prisma.CrmLeadWhereInput[] = [];
  const push = (clause: unknown) => clause && and.push(clause as Prisma.CrmLeadWhereInput);

  push(ownerClause(f.owner, ctx));
  const stages = listValues(f.stage);
  if (stages) push({ stage: { in: stages as CrmLeadStage[] } });
  const channels = listValues(f.channel);
  if (channels) push({ sourceChannel: { in: channels as CrmLeadChannel[] } });
  const sources = listValues(f.source);
  if (sources) push({ source: { in: sources } });
  const companies = listValues(f.company);
  if (companies) push({ clientId: { in: companies } });
  const value = numberClause(f.value);
  if (value) push({ estimatedValue: value });
  const created = dateClause(f.created, ctx);
  if (created) push({ createdAt: created });
  if (f.overdue === true) push({ followUps: { some: { status: "PENDING", dueAt: { lt: ctx.now } } } });
  push(await groupClause(f.group, ctx));
  customFieldClauses(state).forEach(push);
  push(
    searchClause(state.q, (text) => [
      { title: contains(text) },
      { leadNo: contains(text) },
      { contactName: contains(text) },
      { contactEmail: contains(text) },
      { client: { name: contains(text) } },
    ]),
  );

  // Archived leads are out of every list, board and count unless they are
  // what was asked for. Conversion archives a lead, which is what stops it and
  // the deal it became counting as two live opportunities.
  return {
    companyId: ctx.companyId,
    ...archivedClause(state),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

const ORDER: Record<string, (dir: "asc" | "desc") => Prisma.CrmLeadOrderByWithRelationInput[]> = {
  updated: (dir) => [{ updatedAt: dir }],
  created: (dir) => [{ createdAt: dir }],
  value: (dir) => [nullsLast("estimatedValue", dir)],
  stage: (dir) => [{ stage: dir }],
  title: (dir) => [nullsLast("title", dir)],
  ref: (dir) => [{ leadNo: dir }],
};

function laneStatus(stage: string): "OPEN" | "WON" | "LOST" {
  return stage === "WON" || stage === "LOST" ? stage : "OPEN";
}

export const leadsRegister = prismaRegister<LeadRow>({
  def: LEAD_REGISTER,
  where,
  orderBy: (key, dir) => (ORDER[key] ?? ORDER.updated)(dir),
  findMany: async ({ where, orderBy, skip, take }) =>
    shape(
      await prisma.crmLead.findMany({
        where: where as Prisma.CrmLeadWhereInput,
        orderBy: orderBy as Prisma.CrmLeadOrderByWithRelationInput[],
        include,
        skip,
        take,
      }),
    ),
  count: ({ where }) => prisma.crmLead.count({ where: where as Prisma.CrmLeadWhereInput }),
  cells: (lead, ctx) => ({
    name: lead.title ?? lead.leadNo,
    ref: lead.leadNo,
    company: lead.client?.name ?? null,
    stage: optionLabel(LEAD_STAGE_OPTIONS, lead.stage),
    value: lead.estimatedValue,
    owner: lead.assignedTo?.name ?? null,
    next: lead.nextFollowUp?.title ?? null,
    source: lead.source,
    channel: optionLabel(LEAD_CHANNEL_OPTIONS, lead.sourceChannel),
    contact: lead.contactName,
    email: lead.contactEmail,
    phone: lead.contactPhone,
    created: dayCell(lead.createdAt, ctx),
    updated: minuteCell(lead.updatedAt, ctx),
    currency: lead.currency,
  }),
  groupBys: {
    stage: {
      orderBy: [{ stage: "asc" }],
      of: (lead) => ({ id: lead.stage, label: optionLabel(LEAD_STAGE_OPTIONS, lead.stage) }),
      counts: async (where) =>
        countsBy(
          await prisma.crmLead.groupBy({
            by: ["stage"],
            where: where as Prisma.CrmLeadWhereInput,
            _count: { _all: true },
          }),
          "stage",
        ),
    },
    owner: {
      orderBy: [byRelation("assignedTo", "name"), nullsLast("assignedToId", "asc")],
      of: (lead) =>
        lead.assignedTo
          ? { id: lead.assignedTo.id, label: lead.assignedTo.name ?? "Unnamed" }
          : { id: NO_GROUP, label: "Unassigned" },
      counts: async (where) =>
        countsBy(
          await prisma.crmLead.groupBy({
            by: ["assignedToId"],
            where: where as Prisma.CrmLeadWhereInput,
            _count: { _all: true },
          }),
          "assignedToId",
        ),
    },
    channel: {
      orderBy: [{ sourceChannel: "asc" }],
      of: (lead) => ({ id: lead.sourceChannel, label: optionLabel(LEAD_CHANNEL_OPTIONS, lead.sourceChannel) }),
      counts: async (where) =>
        countsBy(
          await prisma.crmLead.groupBy({
            by: ["sourceChannel"],
            where: where as Prisma.CrmLeadWhereInput,
            _count: { _all: true },
          }),
          "sourceChannel",
        ),
    },
    source: {
      orderBy: [nullsLast("source", "asc")],
      of: (lead) => (lead.source ? { id: lead.source, label: lead.source } : { id: NO_GROUP, label: "No source" }),
      counts: async (where) =>
        countsBy(
          await prisma.crmLead.groupBy({
            by: ["source"],
            where: where as Prisma.CrmLeadWhereInput,
            _count: { _all: true },
          }),
          "source",
        ),
    },
  },
  facets: {
    source: async (where) =>
      distinctText(
        (
          await prisma.crmLead.findMany({
            where: where as Prisma.CrmLeadWhereInput,
            select: { source: true },
            distinct: ["source"],
            take: 500,
          })
        ).map((row) => row.source),
      ),
  },
  board: {
    // One fixed set of stages; a stage filter chooses which are drawn.
    async lanes(_ctx, state) {
      const chosen = listValues(state.filters.stage);
      return {
        pipeline: null,
        lanes: LEAD_STAGE_OPTIONS.map((option, position) => ({
          id: option.value,
          name: option.label,
          status: laneStatus(option.value),
          position,
          colorToken: null,
        })).filter((lane) => !chosen || chosen.includes(lane.id)),
        state,
      };
    },
    inLane: (where, laneId) => ({ AND: [where, { stage: laneId }] }),
    totals: async (where) =>
      new Map(
        (
          await prisma.crmLead.groupBy({
            by: ["stage"],
            where: where as Prisma.CrmLeadWhereInput,
            _count: { _all: true },
            _sum: { estimatedValue: true },
          })
        ).map((row) => [row.stage as string, { count: row._count._all, value: row._sum.estimatedValue ?? 0 }]),
      ),
  },
});
