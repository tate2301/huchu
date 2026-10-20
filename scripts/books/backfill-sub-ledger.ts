/**
 * Writes the sub-ledger lines past postings should have written (books-final
 * §6.1 fix 2), for one workspace or all. Idempotent; changes no journal.
 *
 *   pnpm tsx scripts/books/backfill-sub-ledger.ts [--company-id <id>]
 */
import "dotenv/config";

import { writeMissingSubLedgerLines } from "@/lib/books/core/sub-ledger-backfill";
import { prisma } from "@/lib/prisma";

async function main() {
  const index = process.argv.indexOf("--company-id");
  const only = index === -1 ? undefined : process.argv[index + 1];
  const companies = only ? [{ id: only }] : await prisma.company.findMany({ select: { id: true } });
  let written = 0;
  for (const company of companies) {
    const result = await writeMissingSubLedgerLines(company.id);
    written += result.written;
    if (result.written) console.log(`${company.id}: ${result.written} of ${result.checked} postings given their line`);
  }
  console.log(`Done: ${written} sub-ledger lines written across ${companies.length} workspaces.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
