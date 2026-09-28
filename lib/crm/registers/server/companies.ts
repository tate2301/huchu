import type { CrmAccountStatus, CrmCompanyType, Prisma } from "@prisma/client";

import { ACCOUNT_STATUS_OPTIONS, COMPANY_TYPE_OPTIONS, optionLabel } from "@/lib/crm/record-labels";
import { prisma } from "@/lib/prisma";

import { COMPANY_REGISTER } from "../defs/company";
import type { ViewState } from "../types";
import {
  NO_GROUP,
  countsBy,
  dayCell,
  distinctText,
  minuteCell,
  nullsFirstAscending,
  nullsLast,
  prismaRegister,
  byRelation,
} from "./prisma-register";
import type { RegisterContext } from "./types";
import {
  archivedClause,
  contains,
  customFieldClauses,
  dateClause,
  groupClause,
  listValues,
  ownerClause,
  searchClause,
} from "./where";

const include = {
  assignedTo: { select: { id: true, name: true } },
  parent: { select: { id: true, name: true } },
  _count: { select: { people: true, deals: true, sites: true } },
} satisfies Prisma.CrmClientInclude;

export type CompanyRow = Prisma.CrmClientGetPayload<{ include: typeof include }>;

async function where(ctx: RegisterContext, state: ViewState): Promise<Prisma.CrmClientWhereInput> {
  const f = state.filters;
  const and: Prisma.CrmClientWhereInput[] = [];
  const push = (clause: unknown) => clause && and.push(clause as Prisma.CrmClientWhereInput);

  push(ownerClause(f.owner, ctx));
  const statuses = listValues(f.status);
  if (statuses) push({ accountStatus: { in: statuses as CrmAccountStatus[] } });
  const types = listValues(f.type);
  if (types) push({ companyType: { in: types as CrmCompanyType[] } });
  const cities = listValues(f.city);
  if (cities) push({ city: { in: cities } });
  const tags = listValues(f.tag);
  if (tags) push({ tags: { hasSome: tags } });
  const parents = listValues(f.parent);
  if (parents) push({ parentClientId: { in: parents } });
  const contacted = dateClause(f.contacted, ctx);
  if (contacted) push({ lastContactedAt: contacted });
  const created = dateClause(f.created, ctx);
  if (created) push({ createdAt: created });
  push(await groupClause(f.group, ctx));
  customFieldClauses(state).forEach(push);
  push(
    searchClause(state.q, (text) => [
      { name: contains(text) },
      { tradingName: contains(text) },
      { clientNo: contains(text) },
      { email: contains(text) },
      { phone: contains(text) },
      { city: contains(text) },
    ]),
  );

  return {
    companyId: ctx.companyId,
    mergedIntoId: null,
    ...archivedClause(state),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

const ORDER: Record<string, (dir: "asc" | "desc") => Prisma.CrmClientOrderByWithRelationInput[]> = {
  name: (dir) => [{ name: dir }],
  updated: (dir) => [{ updatedAt: dir }],
  created: (dir) => [{ createdAt: dir }],
  contacted: (dir) => [nullsFirstAscending("lastContactedAt", dir)],
  ref: (dir) => [{ clientNo: dir }],
};

export const companiesRegister = prismaRegister<CompanyRow>({
  def: COMPANY_REGISTER,
  where,
  orderBy: (key, dir) => (ORDER[key] ?? ORDER.name)(dir),
  findMany: ({ where, orderBy, skip, take }) =>
    prisma.crmClient.findMany({
      where: where as Prisma.CrmClientWhereInput,
      orderBy: orderBy as Prisma.CrmClientOrderByWithRelationInput[],
      include,
      skip,
      take,
    }),
  count: ({ where }) => prisma.crmClient.count({ where: where as Prisma.CrmClientWhereInput }),
  cells: (company, ctx) => ({
    name: company.name,
    ref: company.clientNo,
    tradingName: company.tradingName,
    status: optionLabel(ACCOUNT_STATUS_OPTIONS, company.accountStatus),
    type: optionLabel(COMPANY_TYPE_OPTIONS, company.companyType),
    location: [company.city, company.country].filter(Boolean).join(", ") || null,
    people: company._count.people,
    deals: company._count.deals,
    owner: company.assignedTo?.name ?? null,
    email: company.email,
    phone: company.phone,
    website: company.website,
    industry: company.industry,
    parent: company.parent?.name ?? null,
    taxNumber: company.taxNumber,
    tags: company.tags.length > 0 ? company.tags.join(", ") : null,
    contacted: dayCell(company.lastContactedAt, ctx),
    created: dayCell(company.createdAt, ctx),
    updated: minuteCell(company.updatedAt, ctx),
  }),
  groupBys: {
    owner: {
      orderBy: [byRelation("assignedTo", "name"), nullsLast("assignedToId", "asc")],
      of: (company) =>
        company.assignedTo
          ? { id: company.assignedTo.id, label: company.assignedTo.name ?? "Unnamed" }
          : { id: NO_GROUP, label: "Unassigned" },
      counts: async (where) =>
        countsBy(
          await prisma.crmClient.groupBy({
            by: ["assignedToId"],
            where: where as Prisma.CrmClientWhereInput,
            _count: { _all: true },
          }),
          "assignedToId",
        ),
    },
    status: {
      orderBy: [{ accountStatus: "asc" }],
      of: (company) => ({
        id: company.accountStatus,
        label: optionLabel(ACCOUNT_STATUS_OPTIONS, company.accountStatus),
      }),
      counts: async (where) =>
        countsBy(
          await prisma.crmClient.groupBy({
            by: ["accountStatus"],
            where: where as Prisma.CrmClientWhereInput,
            _count: { _all: true },
          }),
          "accountStatus",
        ),
    },
    type: {
      orderBy: [{ companyType: "asc" }],
      of: (company) => ({ id: company.companyType, label: optionLabel(COMPANY_TYPE_OPTIONS, company.companyType) }),
      counts: async (where) =>
        countsBy(
          await prisma.crmClient.groupBy({
            by: ["companyType"],
            where: where as Prisma.CrmClientWhereInput,
            _count: { _all: true },
          }),
          "companyType",
        ),
    },
    city: {
      orderBy: [nullsLast("city", "asc")],
      of: (company) => (company.city ? { id: company.city, label: company.city } : { id: NO_GROUP, label: "No city" }),
      counts: async (where) =>
        countsBy(
          await prisma.crmClient.groupBy({
            by: ["city"],
            where: where as Prisma.CrmClientWhereInput,
            _count: { _all: true },
          }),
          "city",
        ),
    },
  },
  facets: {
    city: async (where) =>
      distinctText(
        (
          await prisma.crmClient.findMany({
            where: where as Prisma.CrmClientWhereInput,
            select: { city: true },
            distinct: ["city"],
            take: 500,
          })
        ).map((row) => row.city),
      ),
    tag: async (where) =>
      distinctText(
        (
          await prisma.crmClient.findMany({
            where: { ...(where as Prisma.CrmClientWhereInput), NOT: { tags: { isEmpty: true } } },
            select: { tags: true },
            take: 2_000,
          })
        ).flatMap((row) => row.tags),
      ),
  },
});
