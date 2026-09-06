/**
 * Backfill CrmTask, CrmComment and CrmRecordFile with (subjectType, subjectId).
 *
 * S-4.2 replaced one nullable foreign key per kind with a type-and-id pair. The
 * new columns are nullable while both schemes are live, so every row written
 * before this ran has only its old column. This fills the pair in from it.
 *
 * Resolution is `subjectOf` from lib/records/subject.ts — the same function the
 * application reads with, so a row this script fills and a row it has not yet
 * reached resolve identically. That is deliberate: if the precedence for a
 * multi-subject row is wrong, it is wrong in one place.
 *
 * Precedence, narrowest first: deal, lead, company, person, site, rep. CrmTask's
 * schema comment allows several columns at once — "filed against a deal and its
 * site" — and there the deal is the subject and the site is context. The other
 * columns are NOT cleared, so nothing is lost and a bad call here is reversible
 * until they are dropped.
 *
 * Dry run first:  npx tsx scripts/backfill-record-subjects.ts
 * Apply:          npx tsx scripts/backfill-record-subjects.ts --apply
 *
 * Idempotent: skips any row that already has the pair.
 */

import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client";
import { subjectOf } from "@corelithzw/module-records/subject";

const apply = process.argv.includes("--apply");

const LEGACY_SELECT = {
  id: true,
  subjectType: true,
  subjectId: true,
  leadId: true,
  dealId: true,
  clientId: true,
  personId: true,
  siteId: true,
} as const;

type Counts = { total: number; filled: number; orphaned: number; byType: Record<string, number> };

function tally(): Counts {
  return { total: 0, filled: 0, orphaned: 0, byType: {} };
}

/** The columns `subjectOf` reads, plus the id the update needs. */
type LegacyRow = Parameters<typeof subjectOf>[0] & { id: string };

async function backfill(
  label: string,
  load: () => Promise<LegacyRow[]>,
  write: (id: string, type: string, subjectId: string) => Promise<unknown>,
): Promise<Counts> {
  const counts = tally();
  const rows = await load();
  counts.total = rows.length;

  for (const row of rows) {
    const subject = subjectOf(row);
    if (!subject) {
      // Every column was nullable and nothing stopped all of them being null,
      // so a row naming nothing is possible. Reported rather than guessed at:
      // there is no correct subject to invent.
      counts.orphaned += 1;
      continue;
    }
    counts.byType[subject.type] = (counts.byType[subject.type] ?? 0) + 1;
    counts.filled += 1;
    if (apply) await write(row.id, subject.type, subject.id);
  }

  const parts = Object.entries(counts.byType)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, n]) => `${type} ${n}`)
    .join(", ");
  console.log(
    `${label}: ${counts.total} without the pair, ${counts.filled} resolvable` +
      (parts ? ` (${parts})` : "") +
      (counts.orphaned ? `, ${counts.orphaned} name nothing and were left alone` : ""),
  );
  return counts;
}

async function main() {
  console.log(apply ? "Applying." : "Dry run — nothing will be written. Pass --apply.");

  const tasks = await backfill(
    "CrmTask",
    () =>
      prisma.crmTask.findMany({
        where: { OR: [{ subjectType: null }, { subjectId: null }] },
        select: LEGACY_SELECT,
      }),
    (id, subjectType, subjectId) =>
      prisma.crmTask.update({
        where: { id },
        data: { subjectType: subjectType as never, subjectId },
      }),
  );

  const comments = await backfill(
    "CrmComment",
    () =>
      prisma.crmComment.findMany({
        where: { OR: [{ subjectType: null }, { subjectId: null }] },
        select: LEGACY_SELECT,
      }),
    (id, subjectType, subjectId) =>
      prisma.crmComment.update({
        where: { id },
        data: { subjectType: subjectType as never, subjectId },
      }),
  );

  const files = await backfill(
    "CrmRecordFile",
    () =>
      prisma.crmRecordFile.findMany({
        where: { OR: [{ subjectType: null }, { subjectId: null }] },
        // Files are the only one of the three with a `userId` column, for the
        // rep case.
        select: { ...LEGACY_SELECT, userId: true },
      }),
    (id, subjectType, subjectId) =>
      prisma.crmRecordFile.update({
        where: { id },
        data: { subjectType: subjectType as never, subjectId },
      }),
  );

  const orphaned = tasks.orphaned + comments.orphaned + files.orphaned;
  if (orphaned > 0) {
    console.log(
      `\n${orphaned} rows name no record at all. They are unreachable from any record page ` +
        `already; the pair cannot be filled in for them and dropping the old columns will not ` +
        `make them any less orphaned. Delete them or leave them — but decide before the drop, ` +
        `because afterwards there is nothing left to work out what they were about.`,
    );
  }

  if (!apply) console.log("\nDry run. Re-run with --apply to write.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
