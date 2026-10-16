import type { ReaderAccess } from "@/lib/vane/reader-access";

/**
 * What `explore_reader` may read (`prisma/migrations/20261016100000_explore_reader`,
 * approved 15 Oct).
 *
 * Built on Vane's rules (`lib/vane/reader-access.ts`) so the two can never
 * drift: the same tables and the same per-column grants as `vane_reader`
 * (never pay and personal details, never a credential), cut down twice more
 * by its own restrictive policy on every table:
 *
 * 1. Rows: only the workspace its connection is bound to in
 *    `ExploreReaderScope`, the way `vane_workspace` binds Vane's.
 * 2. Tables: only the tables the person's role reads in the app, which the
 *    binding lists (`tables`), so a sales role bound to a connection cannot
 *    read `Employee` even by naming it.
 *
 * It never reads Vane's or Explore's own tables. `scripts/explore-reader-sql.ts`
 * prints the SQL in the migration.
 */

export const EXPLORE_SCOPE_TABLE = "ExploreReaderScope";

/** Vane's and Explore's own tables: what Vane did and who asked Explore what are not a person's questions to read. */
const OWN_TABLE = /^(Vane|Explore)/;

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

const BOUND = `(SELECT s."companyId" FROM ${ident(EXPLORE_SCOPE_TABLE)} s WHERE s."pid" = pg_backend_pid())`;
const bound = (table: string) =>
  `${literal(table)} = ANY (COALESCE((SELECT s."tables" FROM ${ident(EXPLORE_SCOPE_TABLE)} s WHERE s."pid" = pg_backend_pid()), ARRAY[]::text[]))`;

/** The tables `explore_reader` is granted: Vane's non-private ones, less Vane's and Explore's own. */
export function exploreReadable(access: ReaderAccess): ReaderAccess["readable"] {
  return access.readable.filter((table) => !table.privateTable && table.columns.length > 0 && !OWN_TABLE.test(table.model));
}

/** The SQL that creates the login, binds its scope and grants every readable table. Re-runnable on a fresh database. */
export function exploreReaderSql(access: ReaderAccess): string {
  const out: string[] = [
    `-- The login. NOLOGIN here: give it a password by hand on the server (docs/vane.md, "Setting it up"); none is kept in git.`,
    `DO $$`,
    `BEGIN`,
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'explore_reader') THEN CREATE ROLE explore_reader NOLOGIN; END IF;`,
    `END $$;`,
    `GRANT USAGE ON SCHEMA public TO explore_reader;`,
    ``,
    `-- The binding: the app writes (pid → workspace, person, tables) inside the reading transaction. The reader sees only its own row and cannot write it.`,
    `ALTER TABLE ${ident(EXPLORE_SCOPE_TABLE)} ENABLE ROW LEVEL SECURITY;`,
    `CREATE POLICY "app_all" ON ${ident(EXPLORE_SCOPE_TABLE)} AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);`,
    `CREATE POLICY "explore_own_pid" ON ${ident(EXPLORE_SCOPE_TABLE)} AS RESTRICTIVE FOR SELECT TO explore_reader USING ("pid" = pg_backend_pid());`,
    `GRANT SELECT ("pid", "companyId", "tables") ON ${ident(EXPLORE_SCOPE_TABLE)} TO explore_reader;`,
    ``,
    `-- Every table it reads: the bound workspace's rows of the bound tables only. Row security and app_all are already on (20261012120000_vane).`,
  ];
  for (const table of exploreReadable(access)) {
    const rows =
      table.scope.kind === "company"
        ? `${ident(table.scope.column)} = ${BOUND}`
        : `(${table.scope.links
            .map((link) => `EXISTS (SELECT 1 FROM ${ident(link.parentTable)} p WHERE p.${ident(link.parentColumn)} = ${ident(table.table)}.${ident(link.column)})`)
            .join(" OR ")})`;
    out.push(
      `CREATE POLICY "explore_workspace" ON ${ident(table.table)} AS RESTRICTIVE FOR SELECT TO explore_reader USING (${bound(table.table)} AND ${rows});`,
      `GRANT SELECT (${table.columns.map(ident).join(", ")}) ON ${ident(table.table)} TO explore_reader;`,
    );
  }
  return out.join("\n") + "\n";
}

export { scopeTables } from "./tables";
