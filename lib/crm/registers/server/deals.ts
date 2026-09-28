import type { CrmDealStatus, CrmForecastCategory, Prisma } from "@prisma/client";

import { ensureDefaultPipeline } from "@/lib/crm/pipelines";
import { DEAL_STATUS_OPTIONS, FORECAST_OPTIONS, optionLabel } from "@/lib/crm/record-labels";
import { prisma } from "@/lib/prisma";

import { DEAL_REGISTER } from "../defs/deal";
import type { ViewState } from "../types";
import {
  NO_GROUP,
  byRelation,
  countsBy,
  dayCell,
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
  primaryContact: { select: { id: true, fullName: true } },
  site: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  stage: {
    select: { id: true, name: true, status: true, position: true, colorToken: true, inactivityDays: true },
  },
  pipeline: { select: { id: true, name: true, isDefault: true } },
  // The next thing somebody has promised to do about the deal.
  followUps: {
    where: { status: "PENDING" },
    orderBy: { dueAt: "asc" },
    take: 1,
    select: { id: true, title: true, dueAt: true },
  },
} satisfies Prisma.CrmDealInclude;

type DealRecord = Prisma.CrmDealGetPayload<{ include: typeof include }>;

export type DealRow = Omit<DealRecord, "followUps"> & { nextFollowUp: DealRecord["followUps"][number] | null };

function shape({ followUps, ...deal }: DealRecord): DealRow {
  return { ...deal, nextFollowUp: followUps[0] ?? null };
}

const DAY_MS = 86_400_000;

/**
 * Deals that have sat in their stage longer than the stage allows — its own
 * idle budget, not one number for the whole pipeline: three days in New is
 * neglect, a fortnight in Quoted is waiting on the client. Only open deals in
 * open stages go quiet; a won deal is finished, not forgotten.
 */
async function staleClause(ctx: RegisterContext): Promise<Prisma.CrmDealWhereInput> {
  const stages = await prisma.crmPipelineStage.findMany({
    where: { companyId: ctx.companyId, status: "OPEN", inactivityDays: { not: null } },
    select: { id: true, inactivityDays: true },
  });
  if (stages.length === 0) return { id: { in: [] } };
  return {
    status: "OPEN",
    OR: stages.map((stage) => ({
      stageId: stage.id,
      stageEnteredAt: { lt: new Date(ctx.now.getTime() - (stage.inactivityDays ?? 0) * DAY_MS) },
    })),
  };
}

async function where(ctx: RegisterContext, state: ViewState): Promise<Prisma.CrmDealWhereInput> {
  const f = state.filters;
  const and: Prisma.CrmDealWhereInput[] = [];
  const push = (clause: unknown) => clause && and.push(clause as Prisma.CrmDealWhereInput);

  const pipelines = listValues(f.pipeline);
  if (pipelines) push({ pipelineId: { in: pipelines } });
  const statuses = listValues(f.status);
  if (statuses) push({ status: { in: statuses as CrmDealStatus[] } });
  const stages = listValues(f.stage);
  if (stages) push({ stageId: { in: stages } });
  push(ownerClause(f.owner, ctx));
  const companies = listValues(f.company);
  if (companies) push({ clientId: { in: companies } });
  const sites = listValues(f.site);
  if (sites) push({ siteId: { in: sites } });
  const forecasts = listValues(f.forecast);
  if (forecasts) push({ forecastCategory: { in: forecasts as CrmForecastCategory[] } });
  const value = numberClause(f.value);
  if (value) push({ value });
  const close = dateClause(f.close, ctx);
  if (close) push({ expectedCloseDate: close });
  const created = dateClause(f.created, ctx);
  if (created) push({ createdAt: created });
  if (f.stale === true) push(await staleClause(ctx));
  if (f.overdue === true) push({ followUps: { some: { status: "PENDING", dueAt: { lt: ctx.now } } } });
  // A deal has one project, so one that has it is not an answer to "which
  // deals could a project be started from?".
  if (f.noProject === true) push({ projects: { none: {} } });
  push(await groupClause(f.group, ctx));
  customFieldClauses(state).forEach(push);
  push(
    searchClause(state.q, (text) => [
      { title: contains(text) },
      { dealNo: contains(text) },
      { client: { name: contains(text) } },
      { primaryContact: { fullName: contains(text) } },
    ]),
  );

  return {
    companyId: ctx.companyId,
    ...archivedClause(state),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

const ORDER: Record<string, (dir: "asc" | "desc") => Prisma.CrmDealOrderByWithRelationInput[]> = {
  updated: (dir) => [{ updatedAt: dir }],
  close: (dir) => [nullsLast("expectedCloseDate", dir)],
  value: (dir) => [nullsLast("value", dir)],
  entered: (dir) => [{ stageEnteredAt: dir }],
  created: (dir) => [{ createdAt: dir }],
  title: (dir) => [{ title: dir }],
  ref: (dir) => [{ dealNo: dir }],
};

const LANE = { id: true, name: true, status: true, position: true, colorToken: true } as const;

/**
 * The pipeline a board shows: the one the filter names, or the default. A
 * board is one pipeline at a time — pipelines exist because different work
 * moves through different stages, and a board mixing them would have columns
 * meaning different things depending on which card sat in them.
 */
async function boardPipeline(ctx: RegisterContext, state: ViewState) {
  const chosen = listValues(state.filters.pipeline)?.[0];
  if (chosen) {
    return prisma.crmPipeline.findFirst({
      where: { id: chosen, companyId: ctx.companyId, isActive: true },
      select: { id: true, name: true, stages: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: LANE } },
    });
  }
  const pipeline = await prisma.$transaction((tx) => ensureDefaultPipeline(tx, ctx.companyId));
  return {
    id: pipeline.id,
    name: pipeline.name,
    stages: pipeline.stages.map(({ id, name, status, position, colorToken }) => ({ id, name, status, position, colorToken })),
  };
}

export const dealsRegister = prismaRegister<DealRow>({
  def: DEAL_REGISTER,
  where,
  orderBy: (key, dir) => (ORDER[key] ?? ORDER.updated)(dir),
  findMany: async ({ where, orderBy, skip, take }) =>
    (
      await prisma.crmDeal.findMany({
        where: where as Prisma.CrmDealWhereInput,
        orderBy: orderBy as Prisma.CrmDealOrderByWithRelationInput[],
        include,
        skip,
        take,
      })
    ).map(shape),
  count: ({ where }) => prisma.crmDeal.count({ where: where as Prisma.CrmDealWhereInput }),
  cells: (deal, ctx) => ({
    name: deal.title,
    ref: deal.dealNo,
    company: deal.client?.name ?? null,
    stage: deal.stage.name,
    value: deal.value,
    close: dayCell(deal.expectedCloseDate, ctx),
    owner: deal.assignedTo?.name ?? null,
    next: deal.nextFollowUp?.title ?? null,
    status: optionLabel(DEAL_STATUS_OPTIONS, deal.status),
    pipeline: deal.pipeline.name,
    probability: deal.probability,
    forecast: optionLabel(FORECAST_OPTIONS, deal.forecastCategory),
    contact: deal.primaryContact?.fullName ?? null,
    site: deal.site?.name ?? null,
    entered: dayCell(deal.stageEnteredAt, ctx),
    created: dayCell(deal.createdAt, ctx),
    updated: minuteCell(deal.updatedAt, ctx),
    currency: deal.currency,
  }),
  groupBys: {
    stage: {
      // Pipeline by pipeline, then down each one's stages in order.
      orderBy: [
        { pipeline: { isDefault: "desc" } },
        { pipeline: { position: "asc" } },
        { pipeline: { name: "asc" } },
        { stage: { position: "asc" } },
        { stageId: "asc" },
      ],
      // Two pipelines can both have a "Quoted"; a stage outside the default
      // pipeline says which one it is.
      of: (deal) => ({
        id: deal.stageId,
        label: deal.pipeline.isDefault ? deal.stage.name : `${deal.stage.name} · ${deal.pipeline.name}`,
      }),
      counts: async (where) =>
        countsBy(
          await prisma.crmDeal.groupBy({
            by: ["stageId"],
            where: where as Prisma.CrmDealWhereInput,
            _count: { _all: true },
          }),
          "stageId",
        ),
    },
    owner: {
      orderBy: [byRelation("assignedTo", "name"), nullsLast("assignedToId", "asc")],
      of: (deal) =>
        deal.assignedTo
          ? { id: deal.assignedTo.id, label: deal.assignedTo.name ?? "Unnamed" }
          : { id: NO_GROUP, label: "Unassigned" },
      counts: async (where) =>
        countsBy(
          await prisma.crmDeal.groupBy({
            by: ["assignedToId"],
            where: where as Prisma.CrmDealWhereInput,
            _count: { _all: true },
          }),
          "assignedToId",
        ),
    },
    company: {
      orderBy: [byRelation("client", "name"), nullsLast("clientId", "asc")],
      of: (deal) =>
        deal.client ? { id: deal.client.id, label: deal.client.name } : { id: NO_GROUP, label: "No company" },
      counts: async (where) =>
        countsBy(
          await prisma.crmDeal.groupBy({
            by: ["clientId"],
            where: where as Prisma.CrmDealWhereInput,
            _count: { _all: true },
          }),
          "clientId",
        ),
    },
  },
  board: {
    async lanes(ctx, state) {
      const pipeline = await boardPipeline(ctx, state);
      if (!pipeline) return null;
      // The stage and status filters choose columns as well as cards: a board
      // narrowed to open deals has no Won column standing empty.
      const stages = listValues(state.filters.stage);
      const statuses = listValues(state.filters.status);
      return {
        pipeline: { id: pipeline.id, name: pipeline.name },
        lanes: pipeline.stages.filter(
          (stage) => (!stages || stages.includes(stage.id)) && (!statuses || statuses.includes(stage.status)),
        ),
        state: { ...state, filters: { ...state.filters, pipeline: [pipeline.id] } },
      };
    },
    inLane: (where, laneId) => ({ AND: [where, { stageId: laneId }] }),
    totals: async (where) =>
      new Map(
        (
          await prisma.crmDeal.groupBy({
            by: ["stageId"],
            where: where as Prisma.CrmDealWhereInput,
            _count: { _all: true },
            _sum: { value: true },
          })
        ).map((row) => [row.stageId, { count: row._count._all, value: row._sum.value ?? 0 }]),
      ),
  },
});
