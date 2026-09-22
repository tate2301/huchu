/**
 * Seeding and reading a tenant's site-visit question sets.
 *
 * The questions a rep is asked on site are data, not code. This module turns a
 * template into that data the first time a tenant needs it, exactly the way
 * `ensureDefaultPipeline` turns DEFAULT_STAGE_TEMPLATE into a pipeline: seeded
 * once, then the tenant's rows are the source of truth and the template no
 * longer speaks for them. Editing a question, fixing a seeded type, adding a
 * section — all of it is a settings edit afterwards, not a deployment.
 *
 * Two templates ship:
 *
 *   floorcode-flooring-v1  the client's own 152-question bank, generated from
 *                          their .docx (see floorcode-question-bank.ts).
 *   generic-v1             the eight generic items site-visits.ts has always
 *                          hardcoded, so a tenant who is not FloorCode keeps
 *                          exactly the visit they had before.
 */

import type { Prisma } from "@prisma/client";

import {
  FLOORCODE_QUESTION_BANK,
  type SiteVisitSectionTemplate,
} from "@/lib/crm/site-visits/floorcode-question-bank";
import { DEFAULT_SITE_VISIT_CHECKLIST } from "@/lib/crm/site-visits";

export type Tx = Prisma.TransactionClient;

export const FLOORCODE_TEMPLATE_KEY = "floorcode-flooring-v1";
export const GENERIC_TEMPLATE_KEY = "generic-v1";

/**
 * The generic template, built from the constant the product shipped with.
 *
 * Every item is a yes/no the rep ticks, which is what the old checklist was.
 * Expressed as a template rather than left special-cased, so one code path
 * renders every tenant's visit.
 */
const GENERIC_TEMPLATE: SiteVisitSectionTemplate[] = [
  {
    key: "site_visit_checklist",
    name: "Site visit checklist",
    kind: "closeout",
    questions: DEFAULT_SITE_VISIT_CHECKLIST.map((item) => ({
      key: item.key,
      label: item.label,
      type: "BOOLEAN" as const,
    })),
  },
];

const TEMPLATES: Record<string, SiteVisitSectionTemplate[]> = {
  [FLOORCODE_TEMPLATE_KEY]: FLOORCODE_QUESTION_BANK,
  [GENERIC_TEMPLATE_KEY]: GENERIC_TEMPLATE,
};

export function getTemplate(templateKey: string): SiteVisitSectionTemplate[] | null {
  return TEMPLATES[templateKey] ?? null;
}

export function listTemplateKeys(): string[] {
  return Object.keys(TEMPLATES);
}

const KIND_BY_TEMPLATE = {
  product: "PRODUCT",
  evidence: "EVIDENCE",
  closeout: "CLOSEOUT",
} as const;

/**
 * Match a template section to something in the tenant's catalogue.
 *
 * The bank's section names carry the client's numbering ("8. EPOXY FLOORING"),
 * so the number and any punctuation come off before comparing. A section that
 * matches nothing still seeds — it keeps its name and can be pointed at a
 * product later in settings, which is better than refusing to seed a question
 * because the catalogue is not filled in yet.
 */
function normaliseForMatch(value: string): string {
  return value
    .replace(/^\d+\.\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchProductId(
  sectionName: string,
  products: Array<{ id: string; name: string }>,
): string | null {
  const target = normaliseForMatch(sectionName);
  if (!target) return null;

  const exact = products.find((p) => normaliseForMatch(p.name) === target);
  if (exact) return exact.id;

  // "1. BRANDED MATS / CUSTOM LOGO MATS" should still find "Branded Mats".
  const contained = products.find((p) => {
    const name = normaliseForMatch(p.name);
    return name.length > 3 && (target.includes(name) || name.includes(target));
  });
  return contained?.id ?? null;
}

/**
 * Materialise a template into a tenant's question sets, once.
 *
 * Idempotent, and safe to call on any read path that needs question sets to
 * exist: if the tenant already has any, it returns them untouched rather than
 * re-seeding over edits somebody has made.
 */
export async function ensureSiteVisitQuestionSets(
  tx: Tx,
  companyId: string,
  templateKey: string = GENERIC_TEMPLATE_KEY,
) {
  const existing = await tx.crmQuestionSet.findMany({
    where: { companyId, archivedAt: null },
    include: {
      questions: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { position: "asc" },
  });
  if (existing.length > 0) return existing;

  const template = getTemplate(templateKey);
  if (!template) {
    throw new Error(
      `Unknown site-visit template ${templateKey}. Known: ${listTemplateKeys().join(", ")}`,
    );
  }

  // Only PRODUCT sections look for a catalogue match; evidence and close-out
  // are about the visit, not about a thing being sold.
  const products = await tx.product.findMany({
    where: { companyId, archivedAt: null },
    select: { id: true, name: true },
  });

  for (const [index, section] of template.entries()) {
    await tx.crmQuestionSet.create({
      data: {
        companyId,
        key: section.key,
        name: section.name,
        kind: KIND_BY_TEMPLATE[section.kind],
        productId:
          section.kind === "product" ? matchProductId(section.name, products) : null,
        position: index,
        sourceTemplateKey: templateKey,
        questions: {
          create: section.questions.map((question, questionIndex) => ({
            companyId,
            key: question.key,
            label: question.label,
            type: question.type,
            options: question.options
              ? question.options.map((option) => ({ value: option, label: option }))
              : undefined,
            // The bank's "Capture:" / "Critical:" lines name the shots that
            // matter, so a PHOTO_EVIDENCE question asks for one by definition.
            requiresPhoto: question.type === "PHOTO_EVIDENCE",
            needsReview: question.needsReview ?? false,
            position: questionIndex,
          })),
        },
      },
    });
  }

  return tx.crmQuestionSet.findMany({
    where: { companyId, archivedAt: null },
    include: {
      questions: { where: { archivedAt: null }, orderBy: { position: "asc" } },
    },
    orderBy: { position: "asc" },
  });
}

/**
 * The sets a rep should be offered for a visit.
 *
 * Evidence and close-out always apply. Product sets are offered in catalogue
 * order, and the caller decides which the rep actually opens — a visit is
 * rarely about everything the company sells.
 */
export async function questionSetsForVisit(tx: Tx, companyId: string) {
  const sets = await ensureSiteVisitQuestionSets(tx, companyId);
  return {
    product: sets.filter((set) => set.kind === "PRODUCT" && set.isActive),
    evidence: sets.filter((set) => set.kind === "EVIDENCE" && set.isActive),
    closeout: sets.filter((set) => set.kind === "CLOSEOUT" && set.isActive),
  };
}
