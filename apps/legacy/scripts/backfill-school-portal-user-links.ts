import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client";

/**
 * One-shot backfill of `SchoolStudent.userId` and `SchoolGuardian.userId`.
 *
 * The portals used to infer identity from the session email: a student matched
 * when the local part of their email equalled `studentNo`, a guardian when the
 * session email equalled `SchoolGuardian.email`. That inference is deleted from
 * the runtime. This script applies it once, as a data migration, so accounts
 * that happened to line up under the old rule keep working — and everyone else
 * gets an invite (S-0.3) rather than a silent guess.
 *
 * It is deliberately conservative. Anything ambiguous is reported and skipped:
 * a link is only written when exactly one user and exactly one subject match,
 * and never over an existing link.
 *
 *   pnpm backfill:school-portal-links [--company-id <uuid>] [--apply]
 *
 * Without `--apply` it reports what it would do and writes nothing.
 */

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

type Outcome = {
  linked: number;
  skippedAlreadyLinked: number;
  skippedNoMatch: number;
  skippedAmbiguous: number;
  skippedUserTaken: number;
};

function emptyOutcome(): Outcome {
  return {
    linked: 0,
    skippedAlreadyLinked: 0,
    skippedNoMatch: 0,
    skippedAmbiguous: 0,
    skippedUserTaken: 0,
  };
}

async function backfillStudents(companyId: string, apply: boolean): Promise<Outcome> {
  const outcome = emptyOutcome();

  const students = await prisma.schoolStudent.findMany({
    where: { companyId },
    select: { id: true, studentNo: true, userId: true },
  });

  for (const student of students) {
    if (student.userId) {
      outcome.skippedAlreadyLinked += 1;
      continue;
    }

    // The old rule: email local part, upper-cased, equals studentNo.
    const candidates = await prisma.user.findMany({
      where: {
        companyId,
        email: { startsWith: `${student.studentNo}@`, mode: "insensitive" },
      },
      select: { id: true, email: true },
    });

    if (candidates.length === 0) {
      outcome.skippedNoMatch += 1;
      continue;
    }
    if (candidates.length > 1) {
      outcome.skippedAmbiguous += 1;
      console.warn(
        `[skip] student ${student.studentNo}: ${candidates.length} users match`,
      );
      continue;
    }

    const taken = await prisma.schoolStudent.findFirst({
      where: { companyId, userId: candidates[0].id },
      select: { id: true },
    });
    if (taken) {
      outcome.skippedUserTaken += 1;
      console.warn(
        `[skip] student ${student.studentNo}: ${candidates[0].email} is already linked elsewhere`,
      );
      continue;
    }

    if (apply) {
      await prisma.schoolStudent.update({
        where: { id: student.id },
        data: { userId: candidates[0].id },
      });
    }
    outcome.linked += 1;
  }

  return outcome;
}

async function backfillGuardians(companyId: string, apply: boolean): Promise<Outcome> {
  const outcome = emptyOutcome();

  const guardians = await prisma.schoolGuardian.findMany({
    where: { companyId, email: { not: null } },
    select: { id: true, guardianNo: true, email: true, userId: true },
  });

  // Two guardians sharing a household address is exactly the case the old rule
  // got wrong, so a shared address disqualifies both rather than linking one.
  const byEmail = new Map<string, number>();
  for (const guardian of guardians) {
    const key = guardian.email!.trim().toLowerCase();
    byEmail.set(key, (byEmail.get(key) ?? 0) + 1);
  }

  for (const guardian of guardians) {
    if (guardian.userId) {
      outcome.skippedAlreadyLinked += 1;
      continue;
    }

    const key = guardian.email!.trim().toLowerCase();
    if ((byEmail.get(key) ?? 0) > 1) {
      outcome.skippedAmbiguous += 1;
      console.warn(
        `[skip] guardian ${guardian.guardianNo}: ${key} is shared with another guardian`,
      );
      continue;
    }

    const user = await prisma.user.findFirst({
      where: { companyId, email: { equals: key, mode: "insensitive" } },
      select: { id: true },
    });
    if (!user) {
      outcome.skippedNoMatch += 1;
      continue;
    }

    const taken = await prisma.schoolGuardian.findFirst({
      where: { companyId, userId: user.id },
      select: { id: true },
    });
    if (taken) {
      outcome.skippedUserTaken += 1;
      console.warn(
        `[skip] guardian ${guardian.guardianNo}: ${key} is already linked elsewhere`,
      );
      continue;
    }

    if (apply) {
      await prisma.schoolGuardian.update({
        where: { id: guardian.id },
        data: { userId: user.id },
      });
    }
    outcome.linked += 1;
  }

  return outcome;
}

function report(label: string, outcome: Outcome) {
  console.log(
    `${label}: linked=${outcome.linked} already=${outcome.skippedAlreadyLinked} ` +
      `no-match=${outcome.skippedNoMatch} ambiguous=${outcome.skippedAmbiguous} ` +
      `user-taken=${outcome.skippedUserTaken}`,
  );
}

async function main() {
  const companyIdArg = parseArg("--company-id");
  const apply = process.argv.includes("--apply");

  if (!apply) {
    console.log("DRY RUN — pass --apply to write. Nothing will be changed.\n");
  }

  const companyIds = companyIdArg
    ? [companyIdArg]
    : (await prisma.company.findMany({ select: { id: true } })).map((c) => c.id);

  for (const companyId of companyIds) {
    const students = await backfillStudents(companyId, apply);
    const guardians = await backfillGuardians(companyId, apply);
    if (
      students.linked + guardians.linked === 0 &&
      students.skippedNoMatch + guardians.skippedNoMatch === 0 &&
      students.skippedAlreadyLinked + guardians.skippedAlreadyLinked === 0
    ) {
      continue;
    }
    console.log(`\n[${companyId}]`);
    report("  students", students);
    report("  guardians", guardians);
  }

  console.log(
    "\nUnlinked students and guardians are expected. Invite them from their " +
      "detail page or in bulk; they cannot sign in to a portal until they claim.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
