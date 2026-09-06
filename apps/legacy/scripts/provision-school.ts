import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client";
import { provisionSchool, type SchoolLevel } from "@/lib/schools/provision";

/**
 * Open a school on a tenant that has already been provisioned as a company.
 *
 *   pnpm provision:school --company-id <uuid> [--level COMBINED] [--year 2026]
 *                         [--tuition 250] [--dry-run]
 *
 * Idempotent: re-running adds what is missing and leaves everything else alone,
 * including a term the school has already chosen as current.
 */

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const companyId = parseArg("--company-id");
  if (!companyId) {
    console.error("--company-id is required");
    process.exitCode = 1;
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) {
    console.error(`No company with id ${companyId}`);
    process.exitCode = 1;
    return;
  }

  const level = (parseArg("--level") ?? "COMBINED").toUpperCase() as SchoolLevel;
  if (!["PRIMARY", "SECONDARY", "COMBINED"].includes(level)) {
    console.error("--level must be PRIMARY, SECONDARY or COMBINED");
    process.exitCode = 1;
    return;
  }

  const yearArg = parseArg("--year");
  const tuitionArg = parseArg("--tuition");

  if (process.argv.includes("--dry-run")) {
    console.log(
      `Would open ${company.name} (${company.slug}) as a ${level.toLowerCase()} school` +
        `${yearArg ? ` for ${yearArg}` : ""}. Nothing written.`,
    );
    return;
  }

  const result = await provisionSchool({
    companyId,
    level,
    year: yearArg ? Number(yearArg) : undefined,
    tuitionPerTerm: tuitionArg ? Number(tuitionArg) : undefined,
  });

  // S-2.3: `provisionSchool` seeds the chart of accounts and the school posting
  // rules itself now, so every path that opens a school gets them — not just
  // this one. What it reports is what it created.
  const accounting = result.accounting;

  const current = result.terms.find((term) => term.isActive);

  console.log(`Opened ${company.name} (${company.slug}) as a ${level.toLowerCase()} school\n`);
  console.log(
    `  academic year   ${result.academicYear.code} ` +
      `${result.academicYear.created ? "(created)" : "(already there)"}`,
  );
  console.log(
    `  terms           ${result.terms.map((t) => t.code).join(", ")} — ` +
      `current ${current?.code ?? "not set"}`,
  );
  console.log(`  classes         ${result.classesCreated} created`);
  console.log(`  subjects        ${result.subjectsCreated} created`);
  console.log(
    `  fee structure   ${result.feeStructureCreated ? "created" : "already there"}`,
  );
  console.log(
    `  accounting      ${accounting.accountsCreated} accounts, ` +
      `${accounting.postingRulesCreated} posting rules`,
  );
  console.log(
    `  entitlement     ADDON_SCHOOLS_SUITE, ${result.featuresEnabled} features on`,
  );
  console.log(
    `  enrolments      ${result.enrolmentsCreated} written for ${current?.code ?? "the first term"}`,
  );
  console.log(
    "\nThe school can enrol, invoice and take a register. Everything above is a " +
      "default to edit, not a decision that has been made for them.",
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
