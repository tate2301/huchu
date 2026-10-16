import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Deleting a workspace for good: every row that belongs to it, in one
 * transaction, children before parents.
 *
 * Which rows belong is read from the database, not listed by hand, so a table
 * added next month is not left behind: every table with a `companyId` holds
 * the workspace's rows where it is the workspace's id, and every table with a
 * foreign key into those holds the rows that point at them. The order comes
 * from the same foreign keys. The workspace's audit log is the one thing kept
 * — its rows outlive the company (the key is `SET NULL`), so who deleted it,
 * and why, can still be read.
 */

type Predicate = (alias: string) => string;
type ForeignKey = { child_table: string; parent_table: string; child_columns: string[]; parent_columns: string[] };

/** Kept: the record of what happened to the workspace, including this. */
const KEPT_TABLES = new Set(["PlatformAuditEvent"]);

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

async function companyScopedTables(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name::text AS table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'companyId'`;
  return rows.map((row) => row.table_name);
}

async function foreignKeys(tx: Prisma.TransactionClient): Promise<ForeignKey[]> {
  return tx.$queryRaw<ForeignKey[]>`
    SELECT
      child.relname::text AS child_table,
      parent.relname::text AS parent_table,
      array_agg(child_attr.attname::text ORDER BY cols.ord)::text[] AS child_columns,
      array_agg(parent_attr.attname::text ORDER BY cols.ord)::text[] AS parent_columns
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace
    JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS cols(child_attnum, parent_attnum, ord) ON TRUE
    JOIN pg_attribute child_attr ON child_attr.attrelid = child.oid AND child_attr.attnum = cols.child_attnum
    JOIN pg_attribute parent_attr ON parent_attr.attrelid = parent.oid AND parent_attr.attnum = cols.parent_attnum
    WHERE con.contype = 'f' AND ns.nspname = 'public'
    GROUP BY con.conname, child.relname, parent.relname`;
}

/** Which rows of each table are the workspace's: its own `companyId`, or a key into rows that are. */
export function purgePredicates(scoped: string[], keys: ForeignKey[]): Map<string, Predicate> {
  const predicates = new Map<string, Predicate>([["Company", (alias) => `${alias}."id" = $1`]]);
  for (const table of scoped) {
    if (!KEPT_TABLES.has(table)) predicates.set(table, (alias) => `${alias}."companyId" = $1`);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of keys) {
      if (predicates.has(key.child_table) || KEPT_TABLES.has(key.child_table)) continue;
      const parent = predicates.get(key.parent_table);
      if (!parent) continue;
      predicates.set(key.child_table, (alias) => {
        // Each level of the chain gets its own alias, so an inner one never shadows the row it is joined to.
        const up = `${alias}_p`;
        const join = key.child_columns.map((column, index) => `${up}.${quote(key.parent_columns[index]!)} = ${alias}.${quote(column)}`).join(" AND ");
        return `EXISTS (SELECT 1 FROM ${quote(key.parent_table)} AS ${up} WHERE ${join} AND ${parent(up)})`;
      });
      changed = true;
    }
  }
  return predicates;
}

/** Children first: a table is deleted from before any table it points at. */
export function purgeOrder(tables: string[], keys: ForeignKey[]): string[] {
  const inside = new Set(tables);
  const indegree = new Map(tables.map((table) => [table, 0]));
  const children = new Map<string, Set<string>>();
  for (const key of keys) {
    if (!inside.has(key.child_table) || !inside.has(key.parent_table) || key.child_table === key.parent_table) continue;
    const set = children.get(key.parent_table) ?? new Set<string>();
    if (set.has(key.child_table)) continue;
    set.add(key.child_table);
    children.set(key.parent_table, set);
    indegree.set(key.child_table, (indegree.get(key.child_table) ?? 0) + 1);
  }
  const queue = tables.filter((table) => indegree.get(table) === 0).sort();
  const parentsFirst: string[] = [];
  while (queue.length) {
    const table = queue.shift()!;
    parentsFirst.push(table);
    for (const child of [...(children.get(table) ?? [])].sort()) {
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  const cyclic = tables.filter((table) => !parentsFirst.includes(table)).sort();
  return [...parentsFirst, ...cyclic].reverse();
}

/** Deletes every row of the workspace but its audit log. Returns how many rows went, by table. */
export async function purgeWorkspace(companyId: string): Promise<Record<string, number>> {
  return prisma.$transaction(
    async (tx) => {
      const [scoped, keys] = await Promise.all([companyScopedTables(tx), foreignKeys(tx)]);
      const predicates = purgePredicates(scoped, keys);
      const deleted: Record<string, number> = {};
      for (const table of purgeOrder([...predicates.keys()], keys)) {
        const count = await tx.$executeRawUnsafe(`DELETE FROM ${quote(table)} AS t WHERE ${predicates.get(table)!("t")}`, companyId);
        if (count > 0) deleted[table] = count;
      }
      return deleted;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
