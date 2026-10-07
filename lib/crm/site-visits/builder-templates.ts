/**
 * What a site-visit form can start from in the builder.
 *
 * Two kinds. The measured ones are written for the builder: the floor is
 * measured once, as areas and runs, and the quote is drafted from those
 * measurements. The rest are the sections of the tenant's own question bank,
 * so a form somebody already knows is one click from being rebuilt.
 *
 * A template is copied, never linked: once a form is made from one, it is the
 * tenant's, and changing this file changes no form already made.
 */

import type { Prisma } from "@prisma/client";

import { FLOORCODE_QUESTION_BANK } from "@/lib/crm/site-visits/floorcode-question-bank";
import { fieldFromQuestion, questionFromField } from "@/lib/crm/site-visits/fields";
import { keyFromLabel, type FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

type Tx = Prisma.TransactionClient;

export type BuilderTemplate = {
  key: string;
  name: string;
  /** One line: what it asks. */
  description: string;
  kind: "PRODUCT" | "EVIDENCE" | "CLOSEOUT";
  /** Measured and quoted, or a section of the question bank as it was. */
  group: "measured" | "bank";
  fields: FieldDefinition[];
  quoteLines: QuoteLine[];
};

const section = (key: string, label: string, help?: string): FieldDefinition => ({ key, label, type: "section", required: false, ...(help ? { help } : {}) });
const choices = (...labels: string[]) => labels.map((label) => ({ value: keyFromLabel(label, new Set()), label }));
const photos = (label = "Photos of the floor"): FieldDefinition => ({ key: "photos", label, type: "photos", required: false });

const MEASURED: BuilderTemplate[] = [
  {
    key: "epoxy_flooring_survey",
    name: "Epoxy flooring survey",
    description: "Areas, substrate and moisture, and the quote they make",
    kind: "PRODUCT",
    group: "measured",
    fields: [
      section("the_floor_in_use", "The floor in use"),
      { key: "area_use", label: "What is the area used for?", type: "select", required: true, options: choices("Retail floor", "Warehouse", "Workshop", "Food production", "Other") },
      { key: "forklifts", label: "Forklifts or pallet jacks on it?", type: "checkbox", required: false },
      { key: "washed_daily", label: "Washed down daily?", type: "checkbox", required: false },
      section("measure", "Measure"),
      { key: "areas", label: "Areas to be coated", type: "areas", required: true, unit: "m", help: "Measure wall to wall. Leave out fixed fridges and the till island." },
      { key: "coving", label: "Coving", type: "run", required: false, unit: "m", help: "Each wall that gets a cove." },
      { key: "cracks", label: "Cracks to repair", type: "run", required: false, unit: "m" },
      { key: "moisture", label: "Moisture reading", type: "reading", required: true, unit: "%", warnAbove: 4, warning: "Over 4% — add a damp-proof primer" },
      section("the_system", "The system"),
      { key: "finish", label: "Finish", type: "select", required: true, options: choices("Standard", "Heavy-duty", "Self-levelling", "Non-slip", "Food-grade") },
      { key: "colour", label: "Colour", type: "text", required: false, placeholder: "Light grey RAL 7035" },
      photos(),
      { key: "ready_by", label: "When must the floor be ready?", type: "date", required: false },
    ],
    quoteLines: [
      { id: "system", description: "Epoxy floor system, 2 mm", unit: "m²", unitPrice: 32, quantity: { from: "field", key: "areas", factor: 1.08 } },
      { id: "prep", description: "Diamond grinding and preparation", unit: "m²", unitPrice: 6, quantity: { from: "field", key: "areas", factor: 1 } },
      { id: "coving", description: "Epoxy coving", unit: "m", unitPrice: 14, quantity: { from: "field", key: "coving", factor: 1 } },
      { id: "cracks", description: "Crack repair", unit: "m", unitPrice: 9, quantity: { from: "field", key: "cracks", factor: 1 } },
      { id: "primer", description: "Damp-proof primer", unit: "m²", unitPrice: 7.5, quantity: { from: "field", key: "areas", factor: 1 }, showWhen: { key: "moisture", op: "above", value: 4 } },
    ],
  },
  {
    key: "tile_installation_survey",
    name: "Tile installation survey",
    description: "Areas, tile size and skirting, quoted in boxes",
    kind: "PRODUCT",
    group: "measured",
    fields: [
      { key: "areas", label: "Areas to be tiled", type: "areas", required: true, unit: "m" },
      { key: "tile_size", label: "Tile size", type: "select", required: true, options: choices("600 × 600", "600 × 1200", "300 × 600") },
      { key: "skirting", label: "Skirting", type: "run", required: false, unit: "m" },
      { key: "levelling", label: "Does the floor need levelling first?", type: "checkbox", required: false },
      photos(),
    ],
    quoteLines: [
      { id: "tiles", description: "Porcelain tiles, boxes of 1.44 m²", unit: "boxes", unitPrice: 24, quantity: { from: "field", key: "areas", factor: 1.1, per: 1.44 } },
      { id: "labour", description: "Tiling labour", unit: "m²", unitPrice: 9, quantity: { from: "field", key: "areas", factor: 1 } },
      { id: "skirting", description: "Tile skirting", unit: "m", unitPrice: 6, quantity: { from: "field", key: "skirting", factor: 1 } },
      { id: "screed", description: "Self-levelling screed", unit: "m²", unitPrice: 8, quantity: { from: "field", key: "areas", factor: 1 }, showWhen: { key: "levelling", op: "is", value: "true" } },
    ],
  },
  {
    key: "artificial_grass_survey",
    name: "Artificial grass survey",
    description: "Areas, base, drainage and edging",
    kind: "PRODUCT",
    group: "measured",
    fields: [
      { key: "areas", label: "Areas to be laid", type: "areas", required: true, unit: "m" },
      { key: "base", label: "What is it going down on?", type: "select", required: true, options: choices("Soil", "Concrete", "Paving") },
      { key: "drains_freely", label: "Does water drain away freely?", type: "checkbox", required: false },
      { key: "edging", label: "Edging", type: "run", required: false, unit: "m" },
      photos("Photos of the area"),
    ],
    quoteLines: [
      { id: "grass", description: "Artificial grass, 35 mm", unit: "m²", unitPrice: 18, quantity: { from: "field", key: "areas", factor: 1.05 } },
      { id: "base", description: "Compacted base preparation", unit: "m²", unitPrice: 5, quantity: { from: "field", key: "areas", factor: 1 }, showWhen: { key: "base", op: "is", value: "soil" } },
      { id: "edging", description: "Timber edging", unit: "m", unitPrice: 7, quantity: { from: "field", key: "edging", factor: 1 } },
    ],
  },
  {
    key: "branded_mats_measure_up",
    name: "Branded mats measure-up",
    description: "Each entrance's mat, and whether it carries a logo",
    kind: "PRODUCT",
    group: "measured",
    fields: [
      { key: "mats", label: "Mats", type: "areas", required: true, unit: "m", help: "One line per entrance, named for where it is." },
      { key: "recessed", label: "Are the mats going into a recess?", type: "checkbox", required: false },
      { key: "logo", label: "Logo on the mats?", type: "checkbox", required: false },
      { key: "logo_file", label: "Logo artwork", type: "photos", required: false, showWhen: { key: "logo", op: "is", value: "true" } },
      photos("Photos of each entrance"),
    ],
    quoteLines: [
      { id: "mats", description: "Custom logo mat", unit: "m²", unitPrice: 85, quantity: { from: "field", key: "mats", factor: 1 } },
      { id: "setup", description: "Logo set-up", unit: "each", unitPrice: 45, quantity: { from: "fixed", value: 1 }, showWhen: { key: "logo", op: "is", value: "true" } },
    ],
  },
  {
    key: "close_out_and_handover",
    name: "Close-out and handover",
    description: "Snags, photos and the client's signature",
    kind: "CLOSEOUT",
    group: "measured",
    fields: [
      { key: "walk_round", label: "Walk the site with the client before you leave.", type: "note", required: false },
      { key: "snags", label: "Anything still to put right?", type: "longText", required: false },
      { key: "photos", label: "Photos of the finished work", type: "photos", required: true },
      { key: "client_signature", label: "Client's signature", type: "signature", required: true },
    ],
    quoteLines: [],
  },
];

/** "8. EPOXY FLOORING" → "Epoxy flooring". */
export function bankSectionName(name: string): string {
  const plain = name.replace(/^\d+\.\s*/, "").trim().toLowerCase();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

const KIND = { product: "PRODUCT", evidence: "EVIDENCE", closeout: "CLOSEOUT" } as const;

const BANK: BuilderTemplate[] = FLOORCODE_QUESTION_BANK.map((bankSection) => ({
  key: bankSection.key,
  name: bankSectionName(bankSection.name),
  description: `${bankSection.questions.length} questions from the question bank`,
  kind: KIND[bankSection.kind],
  group: "bank",
  fields: bankSection.questions.map((question) =>
    fieldFromQuestion({
      key: question.key,
      label: question.label,
      helpText: null,
      type: question.type,
      options: question.options,
      unit: null,
      isRequired: false,
    }),
  ),
  quoteLines: [],
}));

export const BUILDER_TEMPLATES: readonly BuilderTemplate[] = [...MEASURED, ...BANK];

export function builderTemplate(key: string): BuilderTemplate | null {
  return BUILDER_TEMPLATES.find((template) => template.key === key) ?? null;
}

/** A key no set in the workspace has used, archived ones included. */
async function freeSetKey(tx: Tx, companyId: string, wanted: string): Promise<string> {
  const taken = new Set(
    (await tx.crmQuestionSet.findMany({ where: { companyId, key: { startsWith: wanted } }, select: { key: true } })).map((set) => set.key),
  );
  return keyFromLabel(wanted, taken);
}

/**
 * A new form, from a template or blank. Made inactive, so reps are not asked
 * a form half-way through being built; it is put in use from the builder.
 */
export async function createQuestionSetFrom(
  tx: Tx,
  companyId: string,
  createdById: string,
  template: BuilderTemplate | null,
) {
  const name = template?.name ?? "Untitled site visit form";
  const key = await freeSetKey(tx, companyId, template?.key ?? "site_visit_form");
  const position = await tx.crmQuestionSet.count({ where: { companyId } });
  return tx.crmQuestionSet.create({
    data: {
      companyId,
      key,
      name,
      kind: template?.kind ?? "PRODUCT",
      position,
      isActive: false,
      createdById,
      quoteLines: (template?.quoteLines ?? []) as Prisma.InputJsonValue,
      questions: {
        create: (template?.fields ?? []).map((field, index) => {
          const row = questionFromField(field);
          return {
            companyId,
            key: row.key,
            label: row.label,
            type: row.type,
            helpText: row.helpText,
            options: (row.options ?? undefined) as Prisma.InputJsonValue | undefined,
            unit: row.unit,
            isRequired: row.isRequired,
            requiresPhoto: field.type === "photos",
            settings: (row.settings ?? undefined) as Prisma.InputJsonValue | undefined,
            position: index,
          };
        }),
      },
    },
  });
}
