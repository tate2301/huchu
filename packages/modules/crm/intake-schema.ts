import { z } from "zod";

/**
 * CRM intake form-builder schema.
 *
 * A form's field list and service list are stored as JSON on CrmIntakeForm.
 * These zod schemas validate that JSON when an admin saves a form, and
 * `buildSubmissionSchema` compiles a stored form definition into a zod schema
 * used to validate a public submission. The built-in contact fields (name,
 * email, phone, services, photos) are always present and are validated
 * separately from the custom fields.
 */

export const CRM_INTAKE_FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "multiselect",
  "checkbox",
  "number",
  "date",
] as const;

export type CrmIntakeFieldType = (typeof CRM_INTAKE_FIELD_TYPES)[number];

const fieldKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "Field key must be snake_case and start with a letter");

const optionSchema = z.object({
  value: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
});

export const crmIntakeFieldDefSchema = z
  .object({
    key: fieldKeySchema,
    label: z.string().min(1).max(160),
    type: z.enum(CRM_INTAKE_FIELD_TYPES),
    required: z.boolean().default(false),
    placeholder: z.string().max(200).optional(),
    helpText: z.string().max(300).optional(),
    options: z.array(optionSchema).max(50).optional(),
  })
  .superRefine((field, ctx) => {
    if ((field.type === "select" || field.type === "multiselect") && (!field.options || field.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Field "${field.key}" of type ${field.type} needs at least one option`,
        path: ["options"],
      });
    }
  });

export type CrmIntakeFieldDef = z.infer<typeof crmIntakeFieldDefSchema>;

export const crmIntakeServiceSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(160),
  description: z.string().max(300).optional(),
});

export type CrmIntakeService = z.infer<typeof crmIntakeServiceSchema>;

export const crmIntakeFieldsSchema = z.array(crmIntakeFieldDefSchema).max(40);
export const crmIntakeServicesSchema = z.array(crmIntakeServiceSchema).max(60);

export const crmIntakeFormConfigSchema = z
  .object({
    fields: crmIntakeFieldsSchema,
    services: crmIntakeServicesSchema,
  })
  .superRefine((config, ctx) => {
    // Duplicate keys would collide in the compiled submission schema (and in
    // stored answers), so reject them at save time.
    const fieldKeys = new Set<string>();
    for (const field of config.fields) {
      if (fieldKeys.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate field key "${field.key}"`,
          path: ["fields"],
        });
      }
      fieldKeys.add(field.key);
    }
    const serviceIds = new Set<string>();
    for (const service of config.services) {
      if (serviceIds.has(service.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate service id "${service.id}"`,
          path: ["services"],
        });
      }
      serviceIds.add(service.id);
    }
  });

export type CrmIntakeFormConfig = z.infer<typeof crmIntakeFormConfigSchema>;

/**
 * Parse the stored JSON on a CrmIntakeForm into a typed config, throwing on
 * malformed data (defends read paths against a hand-edited row).
 */
export function parseIntakeFormConfig(fields: unknown, services: unknown): CrmIntakeFormConfig {
  return crmIntakeFormConfigSchema.parse({
    fields: fields ?? [],
    services: services ?? [],
  });
}

function customAnswerSchema(field: CrmIntakeFieldDef): z.ZodTypeAny {
  switch (field.type) {
    case "number": {
      const base = z.number();
      return field.required ? base : base.optional();
    }
    case "checkbox": {
      const base = z.boolean();
      return field.required ? base.refine((v) => v === true, "Required") : base.optional();
    }
    case "date": {
      const base = z.string().min(1);
      return field.required ? base : base.optional();
    }
    case "select": {
      const values = (field.options ?? []).map((o) => o.value);
      const base = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string();
      return field.required ? base : base.optional();
    }
    case "multiselect": {
      const values = (field.options ?? []).map((o) => o.value);
      const item = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string();
      const base = z.array(item);
      return field.required ? base.min(1, "Required") : base.optional();
    }
    case "text":
    case "textarea":
    default: {
      const base = z.string().min(field.required ? 1 : 0).max(2000);
      return field.required ? base : base.optional();
    }
  }
}

/**
 * Compile a stored form definition into a zod schema that validates a public
 * submission body. Built-in fields (contactName, email, phone, phoneCountry,
 * selectedServices, photoUrls, message) plus a honeypot are always accepted;
 * custom answers are validated per their field definition and unknown keys are
 * rejected.
 */
export function buildSubmissionSchema(config: CrmIntakeFormConfig) {
  const answerShape: Record<string, z.ZodTypeAny> = {};
  for (const field of config.fields) {
    answerShape[field.key] = customAnswerSchema(field);
  }

  const serviceIds = config.services.map((s) => s.id);

  return z.object({
    contactName: z.string().min(1).max(160),
    email: z.string().email().optional(),
    phone: z.string().min(3).max(40).optional(),
    phoneCountry: z.string().max(8).optional(),
    selectedServices: z
      .array(serviceIds.length > 0 ? z.enum(serviceIds as [string, ...string[]]) : z.string())
      .max(60)
      .optional()
      .default([]),
    photoUrls: z.array(z.string().url()).max(20).optional().default([]),
    message: z.string().max(2000).optional(),
    answers: z.object(answerShape).strict().optional().default({}),
    // UTM / attribution passthrough (always captured).
    source: z.string().max(120).optional(),
    utmSource: z.string().max(120).optional(),
    utmMedium: z.string().max(120).optional(),
    utmCampaign: z.string().max(120).optional(),
    utmTerm: z.string().max(120).optional(),
    utmContent: z.string().max(120).optional(),
    referrer: z.string().max(500).optional(),
    landingPage: z.string().max(500).optional(),
    // Honeypot — must be empty; a filled value marks the submission as spam.
    website: z.string().max(0).optional(),
  });
}

export type CrmIntakeSubmissionInput = z.infer<ReturnType<typeof buildSubmissionSchema>>;
