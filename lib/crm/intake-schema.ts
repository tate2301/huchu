import { z } from "zod";

import { answerSchemaFor, fieldListSchema, type FieldDefinition } from "@/lib/forms/fields";

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

/**
 * An intake form's questions are the app's one field definition — the same
 * one a template's questions use and the form builder edits. This file owns
 * only what is intake's alone: the list of services and the submission
 * envelope around the answers.
 */
export type CrmIntakeFieldDef = FieldDefinition;

export const crmIntakeServiceSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(160),
  description: z.string().max(300).optional(),
});

export type CrmIntakeService = z.infer<typeof crmIntakeServiceSchema>;

export const crmIntakeFieldsSchema = fieldListSchema.refine(
  (fields) => fields.length <= 40,
  "An intake form holds up to 40 questions",
);
export const crmIntakeServicesSchema = z.array(crmIntakeServiceSchema).max(60);

export const crmIntakeFormConfigSchema = z
  .object({
    fields: crmIntakeFieldsSchema,
    services: crmIntakeServicesSchema,
  })
  .superRefine((config, ctx) => {
    // Duplicate question keys are already refused by the field list itself.
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
    answerShape[field.key] = answerSchemaFor(field);
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
