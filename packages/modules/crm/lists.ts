/**
 * Static list membership.
 *
 * Members are stored as bare record ids rather than per-entity foreign keys, so
 * one join table serves every record type. The trade-off is that narrowing a
 * query to a list is a two-step: read the ids, then filter on them. That is
 * cheap at the sizes a list is for — a campaign list, a set of VIPs — and it
 * keeps the schema from growing a table per record type.
 */
import type { Prisma } from "@corelithzw/db";

type Tx = Prisma.TransactionClient;

/**
 * The record ids in a list, or null when the list doesn't exist or isn't
 * visible to this user. Null and an empty list mean different things: null is
 * "no such list", empty is "a list with nothing in it".
 */
export async function listRecordIds(
  db: Tx,
  params: { companyId: string; userId: string; listId: string },
): Promise<string[] | null> {
  const list = await db.crmList.findFirst({
    where: {
      id: params.listId,
      companyId: params.companyId,
      OR: [{ isShared: true }, { createdById: params.userId }],
    },
    select: { members: { select: { recordId: true } } },
  });
  if (!list) return null;
  return list.members.map((member) => member.recordId);
}

/**
 * An id filter for a list, or the clause that matches nothing when the list is
 * empty. A filter on an empty list must return no rows — silently ignoring it
 * would show the whole table, which reads as though the filter failed.
 */
export function listIdFilter(recordIds: string[] | null): { id: { in: string[] } } | undefined {
  if (recordIds === null) return undefined;
  return { id: { in: recordIds } };
}

/** How many of the given records are already in the list. */
export async function countListOverlap(
  db: Tx,
  params: { listId: string; recordIds: string[] },
): Promise<number> {
  if (params.recordIds.length === 0) return 0;
  return db.crmListMember.count({
    where: { listId: params.listId, recordId: { in: params.recordIds } },
  });
}
