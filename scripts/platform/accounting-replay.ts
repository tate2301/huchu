import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { retryPendingAccountingEvents } from "@/lib/accounting/integration";

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const companyId = parseArg("--company-id");
  const limit = Number(parseArg("--limit") ?? "200");
  const actorRole = parseArg("--actor-role") ?? "SUPERADMIN";
  const periodOverrideReason = parseArg("--period-override-reason");
  const normalizedLimit = Number.isFinite(limit) ? limit : 200;

  const companyIds = companyId
    ? [companyId]
    : (
        await prisma.company.findMany({
          select: { id: true },
        })
      ).map((company) => company.id);

  let processed = 0;
  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (const id of companyIds) {
    const summary = await retryPendingAccountingEvents({
      companyId: id,
      limit: normalizedLimit,
      actorRole,
      periodOverrideReason,
    });

    processed += summary.processed;
    posted += summary.posted;
    failed += summary.failed;
    skipped += summary.skipped;
    console.log(
      `[${id}] processed=${summary.processed} posted=${summary.posted} skipped=${summary.skipped} failed=${summary.failed}`,
    );
  }

  console.log(`TOTAL processed=${processed} posted=${posted} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((error) => {
    console.error("[accounting-replay] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
