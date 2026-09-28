/**
 * Point a tenant at their site-visit question bank, and seed it.
 *
 * Dry run:  npx tsx scripts/set-site-visit-template.ts --company=floorcode --template=floorcode-flooring-v1
 * Apply:    npx tsx scripts/set-site-visit-template.ts --company=floorcode --template=floorcode-flooring-v1 --apply
 *
 * ## Why this is a script and not one UPDATE
 *
 * `ensureSiteVisitQuestionSets` seeds on first read and then never again —
 * `if (existing.length > 0) return existing`. That is right: it is what stops
 * a re-seed trampling questions somebody has edited.
 *
 * It also means the order matters and there is no second chance. If anyone
 * opens a site visit after the migration is deployed but before the tenant's
 * `siteVisitTemplateKey` is set, that tenant is seeded with the eight generic
 * items permanently, and setting the column afterwards does nothing at all.
 * Somebody would open a visit, see eight checkboxes, and reasonably conclude
 * the whole feature had not shipped.
 *
 * So this sets the column *and* repairs that case, safely:
 *
 *   - Nothing seeded yet        → set the column. The next read seeds correctly.
 *   - Untouched generic seed    → set the column, drop the generic sets, re-seed.
 *   - Anything answered or      → set the column, touch nothing else, and say
 *     edited                      why. Those rows are somebody's work.
 *
 * The third case is not a failure. A tenant whose questions have been answered
 * or edited should be changed in the settings screen, one question at a time,
 * by a person who can see what they are changing.
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  GENERIC_TEMPLATE_KEY,
  ensureSiteVisitQuestionSets,
  getTemplate,
  listTemplateKeys,
} from "@/lib/crm/site-visits/question-sets";

const apply = process.argv.includes("--apply");

function arg(name: string): string | null {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const companyArg = arg("company");
  const templateKey = arg("template");

  if (!companyArg || !templateKey) {
    console.error(
      "Usage: npx tsx scripts/set-site-visit-template.ts --company=<slug|id> --template=<key> [--apply]",
    );
    console.error(`Known templates: ${listTemplateKeys().join(", ")}`);
    process.exit(1);
  }

  if (!getTemplate(templateKey)) {
    console.error(
      `Unknown template "${templateKey}". Known: ${listTemplateKeys().join(", ")}`,
    );
    process.exit(1);
  }

  const company = await prisma.company.findFirst({
    where: { OR: [{ slug: companyArg }, { id: companyArg }] },
    select: { id: true, name: true, slug: true, siteVisitTemplateKey: true },
  });
  if (!company) {
    console.error(`No company matching "${companyArg}".`);
    process.exit(1);
  }

  console.log(`${company.name} (${company.slug})`);
  console.log(`  template key now: ${company.siteVisitTemplateKey ?? "(unset → generic)"}`);
  console.log(`  template key after: ${templateKey}`);

  const sets = await prisma.crmQuestionSet.findMany({
    where: { companyId: company.id, archivedAt: null },
    select: { id: true, key: true, name: true, sourceTemplateKey: true },
  });

  const answers = await prisma.crmSiteVisitAnswer.count({
    where: { companyId: company.id },
  });
  // A set whose provenance has been cleared is one a human has saved.
  const edited = sets.filter((set) => set.sourceTemplateKey === null);
  const alreadyRight = sets.filter((set) => set.sourceTemplateKey === templateKey);
  const genericSeed =
    sets.length > 0 && sets.every((set) => set.sourceTemplateKey === GENERIC_TEMPLATE_KEY);

  const questions = await prisma.crmQuestion.count({
    where: { companyId: company.id, archivedAt: null },
  });
  console.log(`  question sections: ${sets.length}, questions: ${questions}, answers captured: ${answers}`);

  let plan: "set-only" | "reseed" | "hands-off";

  if (sets.length === 0) {
    plan = "set-only";
    console.log("\nNothing seeded yet. Setting the key is enough — the next visit seeds correctly.");
  } else if (alreadyRight.length === sets.length) {
    plan = "set-only";
    console.log(`\nAlready seeded from ${templateKey}. Nothing to re-seed.`);
  } else if (genericSeed && answers === 0 && edited.length === 0) {
    plan = "reseed";
    console.log(
      "\nSeeded with the generic checklist, untouched: no answers captured, nothing edited.",
    );
    console.log(`Will drop ${sets.length} generic section(s) and re-seed from ${templateKey}.`);
  } else {
    plan = "hands-off";
    console.log("\nLeaving the existing questions alone. They are somebody's work:");
    if (answers > 0) console.log(`  - ${answers} answer(s) already captured against them`);
    if (edited.length > 0) {
      console.log(`  - ${edited.length} section(s) edited by hand: ${edited.map((s) => s.name).join(", ")}`);
    }
    console.log("Change these in CRM settings → Site visit questions instead.");
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: company.id },
      data: { siteVisitTemplateKey: templateKey },
    });

    if (plan === "reseed") {
      // Safe because we proved above that nothing here has been answered or
      // edited: these rows are exactly what the generic template created.
      await tx.crmQuestionSet.deleteMany({ where: { companyId: company.id } });
      await ensureSiteVisitQuestionSets(tx, company.id, templateKey);
    }
  });

  const after = await prisma.crmQuestion.count({
    where: { companyId: company.id, archivedAt: null },
  });
  const afterSets = await prisma.crmQuestionSet.count({
    where: { companyId: company.id, archivedAt: null },
  });
  console.log(`\nDone. ${afterSets} section(s), ${after} question(s).`);
  if (plan === "set-only" && afterSets === 0) {
    console.log("Open a site visit (or CRM settings → Site visit questions) to seed them.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
