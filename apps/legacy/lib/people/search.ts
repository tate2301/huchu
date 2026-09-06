import type { Prisma } from "@corelithzw/db";

import type { HrResource } from "@/lib/hr/permissions";
import { EMPLOYEE_POSITION_LABELS } from "@corelithzw/platform/vertical-defaults";
import type { SearchResult } from "@corelithzw/module-records/search-result";
import { facts, wordMatches } from "@corelithzw/module-records/search-result";

/**
 * The People arm of global search.
 *
 * The search box in the app bar already ran two arms — `searchCrm` and
 * `searchSchools` — and returned nothing for an employee. On a payroll bureau,
 * which has no CRM and no school, it returned nothing at all: the box was
 * present on every page and could not find the only records the tenant had.
 *
 * This adds the third arm rather than a third search. Same result shape, same
 * two-axis gate (feature says the tenant bought it, role says this person may
 * look), so the command bar, the ⌘K palette and the mention picker all pick it
 * up without knowing People exists.
 *
 * A roster is deliberately not searchable by member. You look a crew up by its
 * name; you look a person up by theirs, and finding "Payroll desk" by typing
 * "Ada" would put the same person in two groups for one query.
 */

type Tx = Prisma.TransactionClient;

export const PEOPLE_SEARCH_TYPES = ["EMPLOYEE", "SHIFT_GROUP"] as const;

export type PeopleSearchType = (typeof PEOPLE_SEARCH_TYPES)[number];

/**
 * Which feature each arm needs.
 *
 * Not one gate for the module, for the same reason the school arms are split: a
 * tenant that never bought rosters has no crews to find, and surfacing them in a
 * box while every list of them is switched off is the leak the per-arm check
 * exists to stop.
 */
export const PEOPLE_SEARCH_FEATURES: Record<PeopleSearchType, string> = {
  EMPLOYEE: "hr.employees",
  SHIFT_GROUP: "hr.employees",
};

/** The resource each arm's role check is asked about, alongside the feature. */
export const PEOPLE_SEARCH_RESOURCES: Record<PeopleSearchType, HrResource> = {
  EMPLOYEE: "hr.employees",
  SHIFT_GROUP: "hr.employees",
};

/**
 * The positions whose label the query looks like.
 *
 * `Employee.position` is an `EmployeePosition` enum, so it cannot be searched
 * with `contains` — the first cut of this arm tried, and Prisma refused. But a
 * job title is exactly the kind of thing somebody types, so a query matching a
 * label is turned into an exact enum match instead: "driver" finds the drivers,
 * "sales" finds the sales representatives.
 */
function positionMatches(query: string) {
  const needle = query.trim().toLowerCase();
  return (
    Object.entries(EMPLOYEE_POSITION_LABELS) as Array<
      [keyof typeof EMPLOYEE_POSITION_LABELS, string]
    >
  )
    .filter(([, label]) => label.toLowerCase().includes(needle))
    .map(([value]) => value);
}

export async function searchPeople(
  db: Tx,
  input: {
    companyId: string;
    query: string;
    limitPerType?: number;
    /** The arms the caller is entitled to run. Anything absent is not searched. */
    types: readonly PeopleSearchType[];
  },
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const take = input.limitPerType ?? 5;
  const wanted = new Set(input.types);
  const positions = positionMatches(query);
  const arms: Array<Promise<SearchResult[]>> = [];

  if (wanted.has("EMPLOYEE")) {
    arms.push(
      db.employee
        .findMany({
          where: {
            companyId: input.companyId,
            // Name, staff number, department or job title. Not the national ID
            // or the tax number: those identify a person to the state, and a
            // search box that surfaces them turns every colleague into a lookup
            // table.
            OR: [
              { AND: wordMatches(query, ["name", "employeeId"]) },
              { department: { name: { contains: query, mode: "insensitive" } } },
              ...(positions.length > 0 ? [{ position: { in: positions } }] : []),
            ],
          },
          select: {
            id: true,
            name: true,
            employeeId: true,
            position: true,
            isActive: true,
            department: { select: { name: true } },
          },
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          take,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "EMPLOYEE" as const,
            id: row.id,
            reference: row.employeeId,
            title: row.name,
            // The label, not the enum: nobody is looking for "SUPPORT_STAFF".
            subtitle: EMPLOYEE_POSITION_LABELS[row.position] ?? null,
            facts: facts([
              ["Staff number", row.employeeId],
              ["Position", EMPLOYEE_POSITION_LABELS[row.position]],
              ["Department", row.department?.name],
              // Said plainly, because a leaver still answers to their name and
              // paying one is a different decision from paying a colleague.
              ["Status", row.isActive ? "Active" : "Left"],
            ]),
            href: `/people?employeeId=${row.id}`,
          })),
        ),
    );
  }

  if (wanted.has("SHIFT_GROUP")) {
    arms.push(
      db.shiftGroup
        .findMany({
          where: {
            companyId: input.companyId,
            AND: wordMatches(query, ["name", "code"]),
          },
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            site: { select: { name: true } },
            leader: { select: { name: true } },
            _count: { select: { members: true } },
          },
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          take,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "SHIFT_GROUP" as const,
            id: row.id,
            reference: row.code,
            title: row.name,
            // "Whole company" rather than a blank: a crew with no site is the
            // normal case outside a mine, and an empty line reads as missing
            // data.
            subtitle: row.site?.name ?? "Whole company",
            facts: facts([
              ["Code", row.code],
              ["Site", row.site?.name ?? "Whole company"],
              ["Leader", row.leader?.name],
              [
                "Members",
                `${row._count.members} ${
                  row._count.members === 1 ? "person" : "people"
                }`,
              ],
            ]),
            href: `/people/rosters?groupId=${row.id}`,
          })),
        ),
    );
  }

  const results = await Promise.all(arms);
  return results.flat();
}
