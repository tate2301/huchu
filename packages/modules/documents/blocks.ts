import { z } from "zod";

/**
 * The blocks every document in this system is built out of.
 *
 * There were four ways to design a document here — the intake form's field
 * list, the quotation builder's line grid, the invoice renderer's fixed HTML,
 * and the email template's textarea — and they shared nothing. That is four
 * places to add a logo, four places to get the tax line wrong, and four
 * answers when somebody asks "can I put our terms on it".
 *
 * One block list covers all of them because the difference between a form and
 * an invoice is not structural: a form has input blocks and an invoice has
 * value blocks, and both are a stack of headings, text, tables and images with
 * the company's branding at the top. What changes is which blocks a kind
 * offers and whether the reader is filling it in or reading it.
 */

export const TEMPLATE_KINDS = [
  "FORM",
  "QUOTE",
  "INVOICE",
  "RECEIPT",
  "EMAIL",
  "EXPORT",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  FORM: "Form",
  QUOTE: "Quote",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
  EMAIL: "Email",
  EXPORT: "Table export",
};

export const TEMPLATE_KIND_DESCRIPTIONS: Record<TemplateKind, string> = {
  FORM: "Something a person fills in — an intake form, a survey, a sign-off.",
  QUOTE: "What a customer is offered, before they agree to it.",
  INVOICE: "What a customer owes, after they did.",
  RECEIPT: "Proof of a payment that has already been taken.",
  EMAIL: "A message sent about a record, with its details filled in.",
  EXPORT: "The shape of a table when it leaves as a file.",
};

export const BLOCK_TYPES = [
  "heading",
  "text",
  "field",
  "divider",
  "spacer",
  "image",
  "table",
  "lineItems",
  "totals",
  "signature",
  "terms",
  "columns",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Which blocks make sense on which kind of document. */
export const BLOCKS_FOR_KIND: Record<TemplateKind, BlockType[]> = {
  FORM: ["heading", "text", "field", "divider", "spacer", "image", "signature", "terms", "columns"],
  QUOTE: [
    "heading",
    "text",
    "divider",
    "spacer",
    "image",
    "table",
    "lineItems",
    "totals",
    "signature",
    "terms",
    "columns",
  ],
  INVOICE: [
    "heading",
    "text",
    "divider",
    "spacer",
    "image",
    "table",
    "lineItems",
    "totals",
    "terms",
    "columns",
  ],
  RECEIPT: ["heading", "text", "divider", "spacer", "image", "table", "totals", "terms"],
  EMAIL: ["heading", "text", "divider", "spacer", "image", "table", "columns"],
  EXPORT: ["heading", "text", "table", "divider"],
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  text: "Text",
  field: "Question",
  divider: "Divider",
  spacer: "Space",
  image: "Image",
  table: "Table",
  lineItems: "Line items",
  totals: "Totals",
  signature: "Signature",
  terms: "Terms",
  columns: "Side by side",
};

export const FIELD_TYPES = [
  "text",
  "longText",
  "number",
  "email",
  "phone",
  "date",
  "select",
  "multiSelect",
  "checkbox",
  "file",
  "rating",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short answer",
  longText: "Long answer",
  number: "Number",
  email: "Email",
  phone: "Phone",
  date: "Date",
  select: "Pick one",
  multiSelect: "Pick several",
  checkbox: "Yes or no",
  file: "Upload",
  rating: "Rating",
};

const baseBlock = {
  id: z.string().min(1).max(60),
};

/**
 * Everything except `columns`.
 *
 * Split out so the schema is not recursive: a side-by-side block holds these,
 * and a side-by-side block inside a side-by-side block is a layout engine
 * nobody laying out an invoice has ever wanted.
 */
const leafVariants = [
  z.object({
    ...baseBlock,
    type: z.literal("heading"),
    text: z.string().max(300).default(""),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  }),
  z.object({
    ...baseBlock,
    type: z.literal("text"),
    text: z.string().max(5000).default(""),
  }),
  z.object({
    ...baseBlock,
    type: z.literal("field"),
    /** The key an answer is stored under. Stable across renames of the label. */
    key: z.string().min(1).max(60),
    label: z.string().max(200).default(""),
    fieldType: z.enum(FIELD_TYPES).default("text"),
    placeholder: z.string().max(200).optional(),
    help: z.string().max(300).optional(),
    required: z.boolean().default(false),
    options: z.array(z.string().max(120)).max(50).optional(),
    /** Prefill from a variable when the form is opened against a record. */
    prefill: z.string().max(80).optional(),
  }),
  z.object({ ...baseBlock, type: z.literal("divider") }),
  z.object({
    ...baseBlock,
    type: z.literal("spacer"),
    size: z.union([z.literal("sm"), z.literal("md"), z.literal("lg")]).default("md"),
  }),
  z.object({
    ...baseBlock,
    type: z.literal("image"),
    /** `branding.logo` pulls the company logo rather than pinning a URL. */
    source: z.enum(["branding.logo", "url"]).default("branding.logo"),
    url: z.string().max(2000).optional(),
    alt: z.string().max(200).optional(),
    width: z.number().int().min(40).max(1200).optional(),
  }),
  z.object({
    ...baseBlock,
    type: z.literal("table"),
    columns: z
      .array(z.object({ key: z.string().max(80), label: z.string().max(120) }))
      .max(12)
      .default([]),
    /** Which collection on the record fills the rows. */
    source: z.string().max(80).default(""),
  }),
  z.object({
    ...baseBlock,
    type: z.literal("lineItems"),
    showTax: z.boolean().default(true),
    showDiscount: z.boolean().default(false),
  }),
  z.object({
    ...baseBlock,
    type: z.literal("totals"),
    showTax: z.boolean().default(true),
    showPaid: z.boolean().default(false),
  }),
  z.object({
    ...baseBlock,
    type: z.literal("signature"),
    label: z.string().max(200).default("Signature"),
    /** Who is expected to sign. */
    party: z.enum(["customer", "us", "both"]).default("customer"),
  }),
  z.object({
    ...baseBlock,
    type: z.literal("terms"),
    text: z.string().max(20000).default(""),
  }),
] as const;

export const leafBlockSchema = z.discriminatedUnion("type", [...leafVariants]);
export type LeafBlock = z.infer<typeof leafBlockSchema>;

export const blockSchema = z.discriminatedUnion("type", [
  ...leafVariants,
  z.object({
    ...baseBlock,
    type: z.literal("columns"),
    left: z.array(leafBlockSchema).max(20).default([]),
    right: z.array(leafBlockSchema).max(20).default([]),
  }),
]);

export type Block = z.infer<typeof blockSchema>;

/**
 * The attributes that sit above the blocks, Notion-style.
 *
 * A document has properties that are not part of its body — who owns it, what
 * it applies to, when it expires. Notion puts those at the top of the page
 * rather than in a settings dialog, which is right: they are part of what you
 * are looking at, and hiding them behind a gear is how they go stale.
 */
export const templateAttributesSchema = z.object({
  emoji: z.string().max(16).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  /** Free-form key/value pairs the team defines per template. */
  custom: z.record(z.string().max(60), z.string().max(500)).default({}),
});
export type TemplateAttributes = z.infer<typeof templateAttributesSchema>;

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(TEMPLATE_KINDS),
  attributes: templateAttributesSchema.default({ custom: {} }),
  blocks: z.array(blockSchema).max(200).default([]),
  isShared: z.boolean().default(true),
  isActive: z.boolean().default(true),
  /** Which record type this template is for, when it is for one. */
  linkedEntity: z.string().max(40).nullable().optional(),
  linkedRecordId: z.string().uuid().nullable().optional(),
});

/** A fresh block of the requested type, with an id the caller supplies. */
export function emptyBlock(type: BlockType, id: string): Block {
  switch (type) {
    case "heading":
      return { id, type: "heading", text: "", level: 2 };
    case "text":
      return { id, type: "text", text: "" };
    case "field":
      return {
        id,
        type: "field",
        key: id,
        label: "",
        fieldType: "text",
        required: false,
      };
    case "divider":
      return { id, type: "divider" };
    case "spacer":
      return { id, type: "spacer", size: "md" };
    case "image":
      return { id, type: "image", source: "branding.logo" };
    case "table":
      return { id, type: "table", columns: [], source: "" };
    case "lineItems":
      return { id, type: "lineItems", showTax: true, showDiscount: false };
    case "totals":
      return { id, type: "totals", showTax: true, showPaid: false };
    case "signature":
      return { id, type: "signature", label: "Signature", party: "customer" };
    case "terms":
      return { id, type: "terms", text: "" };
    case "columns":
      return { id, type: "columns", left: [], right: [] };
  }
}

/** Every input block in a template, in reading order, columns included. */
export function fieldBlocks(blocks: Block[]): Extract<Block, { type: "field" }>[] {
  const found: Extract<Block, { type: "field" }>[] = [];
  for (const block of blocks) {
    if (block.type === "field") found.push(block);
    if (block.type === "columns") {
      found.push(
        ...block.left.filter((child): child is Extract<Block, { type: "field" }> =>
          child.type === "field",
        ),
        ...block.right.filter((child): child is Extract<Block, { type: "field" }> =>
          child.type === "field",
        ),
      );
    }
  }
  return found;
}

/**
 * What is wrong with this template, in the words somebody can act on.
 *
 * Returned rather than thrown so the editor can show all of it at once. A
 * builder that reports the first problem, gets fixed, then reports the second
 * is a builder people stop trusting to tell them when they are done.
 */
export function templateProblems(kind: TemplateKind, blocks: Block[]): string[] {
  const problems: string[] = [];
  const allowed = new Set(BLOCKS_FOR_KIND[kind]);

  for (const block of blocks) {
    if (!allowed.has(block.type)) {
      problems.push(`A ${BLOCK_LABELS[block.type].toLowerCase()} block does not belong on a ${TEMPLATE_KIND_LABELS[kind].toLowerCase()}.`);
    }
  }

  const fields = fieldBlocks(blocks);
  const keys = new Set<string>();
  for (const field of fields) {
    if (!field.label.trim()) {
      problems.push("Every question needs something to ask.");
      break;
    }
  }
  for (const field of fields) {
    if (keys.has(field.key)) {
      problems.push(`Two questions are saving to "${field.key}" — the second would overwrite the first.`);
      break;
    }
    keys.add(field.key);
  }
  for (const field of fields) {
    if (
      (field.fieldType === "select" || field.fieldType === "multiSelect") &&
      (field.options ?? []).length === 0
    ) {
      problems.push(`"${field.label || field.key}" asks somebody to pick, but offers nothing to pick from.`);
    }
  }

  if (kind === "FORM" && fields.length === 0) {
    problems.push("A form with no questions collects nothing.");
  }

  return [...new Set(problems)];
}

export type FieldBlock = Extract<Block, { type: "field" }>;

/**
 * What a single answer is allowed to be.
 *
 * The form builder already declares this — a question is a number, or a date,
 * or a pick from six options — and until now the public endpoint read none of
 * it. Anything non-empty satisfied a required question, so "banana" was a
 * valid answer to "How many units?" and a select could come back with an
 * option that was never offered. That is not a cosmetic gap: these answers are
 * read back as record values.
 *
 * Optional questions accept `undefined`, `null` and `""` alike and normalise
 * them all to absent, because three ways of saying "they didn't answer" is
 * three branches at every reader.
 */
export function answerSchemaFor(field: FieldBlock): z.ZodTypeAny {
  const options = field.options ?? [];

  const base = (): z.ZodTypeAny => {
    switch (field.fieldType) {
      case "longText":
        return z.string().max(5000);
      case "number":
      case "rating":
        // Numbers arrive as strings from a plain form post as often as not.
        return z.coerce.number().finite();
      case "email":
        return z.string().trim().email().max(200);
      case "phone":
        return z.string().trim().min(3).max(40);
      case "date":
        return z.string().trim().refine(
          (value) => !Number.isNaN(new Date(value).getTime()),
          "Not a date",
        );
      case "checkbox":
        return z.coerce.boolean();
      case "select":
        // An option that was never offered is not an answer to this question.
        return options.length > 0 ? z.enum(options as [string, ...string[]]) : z.string().max(200);
      case "multiSelect":
        return z
          .array(options.length > 0 ? z.enum(options as [string, ...string[]]) : z.string().max(200))
          .max(50);
      case "file":
        // What is stored is where the upload landed, not the file itself.
        // `C:\fakepath\plan.pdf` — what a browser puts in a file input's value
        // — parses as a URL with scheme "c:", so the scheme has to be named.
        return z
          .string()
          .trim()
          .max(2000)
          .refine((value) => /^https?:\/\//i.test(value), "Not an uploaded file");
      case "text":
      default:
        return z.string().max(1000);
    }
  };

  const schema = base();
  if (field.required) {
    // A required text question is not satisfied by whitespace, so the trim has
    // to happen before the length is counted.
    return field.fieldType === "multiSelect"
      ? (schema as z.ZodArray<z.ZodTypeAny>).min(1, "Pick at least one")
      : schema instanceof z.ZodString
        ? schema.trim().min(1, "Required")
        : schema;
  }
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    schema.optional(),
  );
}

export type AnswerProblem = { key: string; label: string; message: string };

/**
 * Check a submission against the form that produced it.
 *
 * Returns every problem rather than the first, because a person who fixes one
 * field, resubmits and is told about the next one gives up around the third.
 * Unknown keys are dropped: a stale cached form or somebody poking at the
 * endpoint is not a reason to write columns nobody asked for.
 */
export function validateAnswers(
  fields: FieldBlock[],
  answers: Record<string, unknown>,
): { values: Record<string, unknown>; problems: AnswerProblem[] } {
  const values: Record<string, unknown> = {};
  const problems: AnswerProblem[] = [];

  for (const field of fields) {
    const raw = answers[field.key];

    if (!field.required && (raw === undefined || raw === null || raw === "")) continue;
    if (field.required && (raw === undefined || raw === null || raw === "")) {
      problems.push({ key: field.key, label: field.label || field.key, message: "Required" });
      continue;
    }

    const parsed = answerSchemaFor(field).safeParse(raw);
    if (!parsed.success) {
      problems.push({
        key: field.key,
        label: field.label || field.key,
        message: parsed.error.issues[0]?.message ?? "Not valid",
      });
      continue;
    }
    if (parsed.data !== undefined) values[field.key] = parsed.data;
  }

  return { values, problems };
}
