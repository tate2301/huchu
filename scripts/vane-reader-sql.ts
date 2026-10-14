/**
 * Prints the SQL that gives Vane's reader roles their access: the roles, a row
 * policy on every readable table, and per-column grants. See
 * lib/vane/reader-access.ts for the rules.
 *
 *   pnpm vane:reader-sql > grants.sql          everything, as in 20261012120000_vane
 *   pnpm vane:reader-sql --summary             what each role reads, by table
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseSchema, readerAccess, readerSql } from "@/lib/vane/reader-access";

const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
const access = readerAccess(parseSchema(schema));

if (process.argv.includes("--summary")) {
  const pay = access.readable.filter((t) => t.privateTable).map((t) => t.table);
  const personal = access.readable.filter((t) => !t.privateTable && t.privateColumns.length);
  console.log(`vane_reader reads ${access.readable.filter((t) => !t.privateTable).length} tables.`);
  console.log(`Only vane_reader_private reads pay: ${pay.join(", ")}`);
  for (const t of personal) console.log(`Only vane_reader_private reads ${t.table}: ${t.privateColumns.join(", ")}`);
  for (const reason of ["credentials", "conversation", "no workspace link"] as const) {
    console.log(`Neither reads (${reason}): ${access.unreadable.filter((t) => t.reason === reason).map((t) => t.table).join(", ")}`);
  }
} else {
  process.stdout.write(readerSql(access));
}
