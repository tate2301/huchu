/**
 * Prints the SQL that gives Explore's own login, `explore_reader`, its access
 * (lib/explore/reader-access.ts), and Vane's reader lines for the tables the
 * migration adds (prisma/migrations/20261015120000_explore_reader, approved
 * 15 Oct). A migration that adds tables Explore should read pastes the lines
 * for them from here, as it does Vane's from `pnpm vane:reader-sql`.
 *
 *   pnpm explore:reader-sql                       explore_reader's login, binding, policies and grants
 *   pnpm explore:reader-sql --vane-new            Vane's lines for Explore's own tables
 *
 * Both read prisma/schema.prisma.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { exploreReaderSql } from "@/lib/explore/reader-access";
import { parseSchema, readerAccess, readerSql } from "@/lib/vane/reader-access";

const root = process.cwd();
const access = readerAccess(parseSchema(readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")));

if (process.argv.includes("--vane-new")) {
  const added = new Set(["ExploreReaderScope", "ExploreSettings", "ExploreQuestionRun"]);
  const lines = readerSql({ readable: access.readable.filter((table) => added.has(table.table)), unreadable: [] }).split("\n");
  // Only the per-table lines: the roles and Vane's binding are already there (20261012120000_vane).
  const start = lines.findIndex((line) => line.startsWith("-- Every readable table"));
  process.stdout.write(`${lines.slice(start).join("\n")}`);
} else {
  process.stdout.write(exploreReaderSql(access));
}
