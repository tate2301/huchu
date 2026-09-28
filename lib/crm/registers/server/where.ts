/**
 * The clauses every list builds its `where` from.
 *
 * Kept apart from any one model: an owner filter reads the same on people,
 * companies and deals, and a list that wrote its own copy is a list where
 * "Nobody" quietly means something else.
 */
import { listRecordIds } from "@/lib/crm/lists";
import { prisma } from "@/lib/prisma";

import { customFieldFilters } from "../codec";
import { dateFilterRange } from "../dates";
import type { FilterValue, ViewState } from "../types";
import type { RegisterContext } from "./types";

/** A list filter's answers, or undefined when it narrows nothing. */
export function listValues(value: FilterValue | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return [...(value as readonly string[])];
}

/**
 * Whose records: `me` is the reader, `none` is nobody's, anything else a
 * team member's id. Several answers are alternatives — "mine or nobody's".
 */
export function ownerClause(
  value: FilterValue | undefined,
  ctx: RegisterContext,
  field = "assignedToId",
): Record<string, unknown> | undefined {
  const values = listValues(value);
  if (!values) return undefined;
  const ids = [...new Set(values.filter((v) => v !== "none").map((v) => (v === "me" ? ctx.userId : v)))];
  const alternatives: Array<Record<string, unknown>> = [];
  if (ids.length > 0) alternatives.push({ [field]: { in: ids } });
  if (values.includes("none")) alternatives.push({ [field]: null });
  return alternatives.length === 1 ? alternatives[0] : { OR: alternatives };
}

/** A date filter on one column, as a Prisma range. */
export function dateClause(value: FilterValue | undefined, ctx: RegisterContext) {
  return dateFilterRange(value, { now: ctx.now, tz: ctx.tz });
}

/** A number filter on one column, as a Prisma range. */
export function numberClause(value: FilterValue | undefined): { gte?: number; lte?: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const range = value as { min?: number; max?: number };
  if (range.min === undefined && range.max === undefined) return undefined;
  return {
    ...(range.min !== undefined ? { gte: range.min } : {}),
    ...(range.max !== undefined ? { lte: range.max } : {}),
  };
}

/**
 * Records in any of the named groups. A group the reader cannot see matches
 * nothing rather than being ignored: a link to a private group should show an
 * empty list, not the whole table dressed up as the group.
 */
export async function groupClause(
  value: FilterValue | undefined,
  ctx: RegisterContext,
): Promise<{ id: { in: string[] } } | undefined> {
  const groups = listValues(value);
  if (!groups) return undefined;
  const members = await Promise.all(
    groups.map((listId) =>
      listRecordIds(prisma, { companyId: ctx.companyId, userId: ctx.userId, listId }),
    ),
  );
  return { id: { in: [...new Set(members.flatMap((ids) => ids ?? []))] } };
}

/**
 * Custom fields: each field is one question, its answers alternatives. A
 * single-choice field stores a value and a multi-choice field an array, so
 * each answer is tried both ways.
 */
export function customFieldClauses(state: ViewState): Array<Record<string, unknown>> {
  return Object.entries(customFieldFilters(state)).map(([key, answers]) => ({
    OR: answers.flatMap((answer) => [
      { customFields: { path: [key], equals: answer } },
      { customFields: { path: [key], array_contains: [answer] } },
    ]),
  }));
}

/** Archived records only, or none of them — never both mixed in one list. */
export function archivedClause(state: ViewState): { archivedAt: null | { not: null } } {
  return { archivedAt: state.filters.archived === true ? { not: null } : null };
}

/** Words typed into search, matched case-blind against any of the given clauses. */
export function searchClause(
  q: string | undefined,
  match: (text: string) => Array<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const text = q?.trim();
  if (!text) return undefined;
  return { OR: match(text) };
}

export const contains = (text: string) => ({ contains: text, mode: "insensitive" as const });
