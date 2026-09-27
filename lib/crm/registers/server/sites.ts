import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { SITE_REGISTER } from "../defs/site";
import type { ViewState } from "../types";
import { dayCell, distinctText, minuteCell, prismaRegister } from "./prisma-register";
import type { RegisterContext } from "./types";
import {
  archivedClause,
  contains,
  customFieldClauses,
  dateClause,
  groupClause,
  listValues,
  searchClause,
} from "./where";

const include = {
  client: { select: { id: true, name: true } },
  primaryContact: { select: { id: true, fullName: true, phone: true } },
  _count: { select: { deals: true, appointments: true } },
} satisfies Prisma.CrmSiteInclude;

export type SiteRow = Prisma.CrmSiteGetPayload<{ include: typeof include }>;

async function where(ctx: RegisterContext, state: ViewState): Promise<Prisma.CrmSiteWhereInput> {
  const f = state.filters;
  const and: Prisma.CrmSiteWhereInput[] = [];
  const push = (clause: unknown) => clause && and.push(clause as Prisma.CrmSiteWhereInput);

  const companies = listValues(f.company);
  if (companies) push({ clientId: { in: companies } });
  const cities = listValues(f.city);
  if (cities) push({ city: { in: cities } });
  const tags = listValues(f.tag);
  if (tags) push({ tags: { hasSome: tags } });
  const created = dateClause(f.created, ctx);
  if (created) push({ createdAt: created });
  push(await groupClause(f.group, ctx));
  customFieldClauses(state).forEach(push);
  push(
    searchClause(state.q, (text) => [
      { name: contains(text) },
      { siteNo: contains(text) },
      { addressLine: contains(text) },
      { city: contains(text) },
      { client: { name: contains(text) } },
    ]),
  );

  return {
    companyId: ctx.companyId,
    ...archivedClause(state),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

const ORDER: Record<string, (dir: "asc" | "desc") => Prisma.CrmSiteOrderByWithRelationInput[]> = {
  name: (dir) => [{ name: dir }],
  updated: (dir) => [{ updatedAt: dir }],
  created: (dir) => [{ createdAt: dir }],
  ref: (dir) => [{ siteNo: dir }],
};

export const sitesRegister = prismaRegister<SiteRow>({
  def: SITE_REGISTER,
  where,
  orderBy: (key, dir) => (ORDER[key] ?? ORDER.name)(dir),
  findMany: ({ where, orderBy, skip, take }) =>
    prisma.crmSite.findMany({
      where: where as Prisma.CrmSiteWhereInput,
      orderBy: orderBy as Prisma.CrmSiteOrderByWithRelationInput[],
      include,
      skip,
      take,
    }),
  count: ({ where }) => prisma.crmSite.count({ where: where as Prisma.CrmSiteWhereInput }),
  cells: (site, ctx) => ({
    name: site.name,
    ref: site.siteNo,
    company: site.client?.name ?? null,
    address: [site.addressLine, site.city, site.country].filter(Boolean).join(", ") || null,
    city: site.city,
    country: site.country,
    contact: site.primaryContact?.fullName ?? null,
    deals: site._count.deals,
    visits: site._count.appointments,
    coordinates:
      site.latitude !== null && site.longitude !== null
        ? `${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}`
        : null,
    tags: site.tags.length > 0 ? site.tags.join(", ") : null,
    created: dayCell(site.createdAt, ctx),
    updated: minuteCell(site.updatedAt, ctx),
  }),
  facets: {
    city: async (where) =>
      distinctText(
        (
          await prisma.crmSite.findMany({
            where: where as Prisma.CrmSiteWhereInput,
            select: { city: true },
            distinct: ["city"],
            take: 500,
          })
        ).map((row) => row.city),
      ),
    tag: async (where) =>
      distinctText(
        (
          await prisma.crmSite.findMany({
            where: { ...(where as Prisma.CrmSiteWhereInput), NOT: { tags: { isEmpty: true } } },
            select: { tags: true },
            take: 2_000,
          })
        ).flatMap((row) => row.tags),
      ),
  },
});
