import type { CrmContactType, Prisma } from "@prisma/client";

import { CONTACT_TYPE_OPTIONS, PREFERRED_CHANNEL_OPTIONS, optionLabel } from "@/lib/crm/record-labels";
import { prisma } from "@/lib/prisma";

import { PERSON_REGISTER } from "../defs/person";
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
  client: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { dealContacts: true } },
} satisfies Prisma.CrmPersonInclude;

export type PersonRow = Prisma.CrmPersonGetPayload<{ include: typeof include }>;

async function where(ctx: RegisterContext, state: ViewState): Promise<Prisma.CrmPersonWhereInput> {
  const f = state.filters;
  const and: Prisma.CrmPersonWhereInput[] = [];
  const push = (clause: unknown) => clause && and.push(clause as Prisma.CrmPersonWhereInput);

  push(ownerClause(f.owner, ctx));
  const types = listValues(f.type);
  if (types) push({ contactType: { in: types as CrmContactType[] } });
  const companies = listValues(f.company);
  if (companies) push({ clientId: { in: companies } });
  const cities = listValues(f.city);
  if (cities) push({ city: { in: cities } });
  const tags = listValues(f.tag);
  if (tags) push({ tags: { hasSome: tags } });
  const contacted = dateClause(f.contacted, ctx);
  if (contacted) push({ lastContactedAt: contacted });
  const created = dateClause(f.created, ctx);
  if (created) push({ createdAt: created });
  push(await groupClause(f.group, ctx));
  customFieldClauses(state).forEach(push);
  push(
    searchClause(state.q, (text) => [
      { fullName: contains(text) },
      { email: contains(text) },
      { phone: contains(text) },
      { personNo: contains(text) },
      { client: { name: contains(text) } },
    ]),
  );

  return {
    companyId: ctx.companyId,
    mergedIntoId: null,
    ...archivedClause(state),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

const ORDER: Record<string, (dir: "asc" | "desc") => Prisma.CrmPersonOrderByWithRelationInput[]> = {
  name: (dir) => [{ fullName: dir }],
  updated: (dir) => [{ updatedAt: dir }],
  created: (dir) => [{ createdAt: dir }],
  contacted: (dir) => [nullsFirstAscending("lastContactedAt", dir)],
  ref: (dir) => [{ personNo: dir }],
};

export const peopleRegister = prismaRegister<PersonRow>({
  def: PERSON_REGISTER,
  where,
  orderBy: (key, dir) => (ORDER[key] ?? ORDER.name)(dir),
  findMany: ({ where, orderBy, skip, take }) =>
    prisma.crmPerson.findMany({
      where: where as Prisma.CrmPersonWhereInput,
      orderBy: orderBy as Prisma.CrmPersonOrderByWithRelationInput[],
      include,
      skip,
      take,
    }),
  count: ({ where }) => prisma.crmPerson.count({ where: where as Prisma.CrmPersonWhereInput }),
  cells: (person, ctx) => ({
    name: person.fullName,
    ref: person.personNo,
    jobTitle: person.jobTitle,
    company: person.client?.name ?? null,
    email: person.email,
    phone: person.phone,
    type: optionLabel(CONTACT_TYPE_OPTIONS, person.contactType),
    deals: person._count.dealContacts,
    owner: person.assignedTo?.name ?? null,
    city: person.city,
    country: person.country,
    channel: person.preferredChannel ? optionLabel(PREFERRED_CHANNEL_OPTIONS, person.preferredChannel) : null,
    tags: person.tags.length > 0 ? person.tags.join(", ") : null,
    contacted: dayCell(person.lastContactedAt, ctx),
    created: dayCell(person.createdAt, ctx),
    updated: minuteCell(person.updatedAt, ctx),
  }),
  groupBys: {
    owner: {
      orderBy: [byRelation("assignedTo", "name"), nullsLast("assignedToId", "asc")],
      of: (person) =>
        person.assignedTo
          ? { id: person.assignedTo.id, label: person.assignedTo.name ?? "Unnamed" }
          : { id: NO_GROUP, label: "Unassigned" },
      counts: async (where) =>
        countsBy(
          await prisma.crmPerson.groupBy({
            by: ["assignedToId"],
            where: where as Prisma.CrmPersonWhereInput,
            _count: { _all: true },
          }),
          "assignedToId",
        ),
    },
    type: {
      orderBy: [{ contactType: "asc" }],
      of: (person) => ({ id: person.contactType, label: optionLabel(CONTACT_TYPE_OPTIONS, person.contactType) }),
      counts: async (where) =>
        countsBy(
          await prisma.crmPerson.groupBy({
            by: ["contactType"],
            where: where as Prisma.CrmPersonWhereInput,
            _count: { _all: true },
          }),
          "contactType",
        ),
    },
    company: {
      orderBy: [byRelation("client", "name"), nullsLast("clientId", "asc")],
      of: (person) =>
        person.client ? { id: person.client.id, label: person.client.name } : { id: NO_GROUP, label: "No company" },
      counts: async (where) =>
        countsBy(
          await prisma.crmPerson.groupBy({
            by: ["clientId"],
            where: where as Prisma.CrmPersonWhereInput,
            _count: { _all: true },
          }),
          "clientId",
        ),
    },
  },
  facets: {
    city: async (where) =>
      distinctText(
        (
          await prisma.crmPerson.findMany({
            where: where as Prisma.CrmPersonWhereInput,
            select: { city: true },
            distinct: ["city"],
            take: 500,
          })
        ).map((row) => row.city),
      ),
    tag: async (where) =>
      distinctText(
        (
          await prisma.crmPerson.findMany({
            where: { ...(where as Prisma.CrmPersonWhereInput), NOT: { tags: { isEmpty: true } } },
            select: { tags: true },
            take: 2_000,
          })
        ).flatMap((row) => row.tags),
      ),
  },
});
