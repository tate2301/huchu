/**
 * CRM import.
 *
 * The shape of this is deliberately two-step: work out what would happen, show
 * it, then do it. An import that writes first and reports afterwards leaves
 * somebody reconciling four thousand rows by hand.
 */
import { z } from "zod";

import {
  buildImportPlan as buildPlan,
  columnPreview,
  mappingWarnings,
  parseImportList,
  parseImportNumber,
  type ColumnPreview,
  type ImportField,
  type ImportPlan as CoreImportPlan,
  type ImportRowIssue,
  type ImportRowPlan,
} from "@corelithzw/platform/import-core/plan";

import { parseCsv, type CsvTable } from "./csv";

// The planning pass, the column preview and the value parsers moved to
// lib/import-core when the schools importer needed them. What stayed here is
// everything that knows what a person, a company or a deal is.
export {
  columnPreview,
  mappingWarnings,
  parseImportList,
  parseImportNumber,
  type ColumnPreview,
  type ImportField,
  type ImportRowIssue,
  type ImportRowPlan,
};

export const IMPORT_ENTITIES = ["PERSON", "COMPANY", "LEAD"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export const IMPORT_FIELDS: Record<ImportEntity, ImportField[]> = {
  PERSON: [
    { key: "firstName", label: "First name", required: true, aliases: ["first", "givenname"] },
    { key: "lastName", label: "Last name", aliases: ["last", "surname", "familyname"] },
    { key: "email", label: "Email", aliases: ["emailaddress", "mail"] },
    { key: "phone", label: "Phone", aliases: ["mobile", "cell", "telephone", "phonenumber"] },
    { key: "jobTitle", label: "Job title", aliases: ["title", "position", "role"] },
    { key: "companyName", label: "Company", aliases: ["organisation", "organization", "employer"] },
    { key: "city", label: "City", aliases: ["town"] },
    { key: "country", label: "Country" },
    { key: "notes", label: "Notes", aliases: ["comments"] },
    { key: "tags", label: "Tags", aliases: ["labels"] },
  ],
  COMPANY: [
    { key: "name", label: "Name", required: true, aliases: ["companyname", "organisation", "organization"] },
    { key: "tradingName", label: "Trading name", aliases: ["tradingas", "dba"] },
    { key: "contactName", label: "Contact name", aliases: ["contact"] },
    { key: "email", label: "Email", aliases: ["emailaddress"] },
    { key: "phone", label: "Phone", aliases: ["telephone", "mobile"] },
    { key: "website", label: "Website", aliases: ["url", "site"] },
    { key: "registrationNumber", label: "Registration number", aliases: ["regno", "companyno"] },
    { key: "taxNumber", label: "Tax number", aliases: ["vat", "vatnumber", "tin"] },
    { key: "industry", label: "Industry", aliases: ["sector"] },
    { key: "city", label: "City", aliases: ["town"] },
    { key: "country", label: "Country" },
    { key: "tags", label: "Tags" },
  ],
  LEAD: [
    { key: "title", label: "Title", required: true, aliases: ["subject", "opportunity", "dealname"] },
    { key: "contactName", label: "Contact name", aliases: ["contact", "name"] },
    { key: "contactEmail", label: "Email", aliases: ["email", "emailaddress"] },
    { key: "contactPhone", label: "Phone", aliases: ["phone", "mobile", "telephone"] },
    { key: "companyName", label: "Company", aliases: ["organisation", "organization", "client"] },
    { key: "estimatedValue", label: "Value", aliases: ["amount", "dealvalue", "budget"] },
    { key: "currency", label: "Currency" },
    { key: "source", label: "Source", aliases: ["leadsource", "origin"] },
    { key: "services", label: "Services", aliases: ["products", "interestedin"] },
  ],
};

export const importMappingSchema = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  mapping: z.record(z.string(), z.string()),
  /** What to do when a row matches an existing record. */
  onDuplicate: z.enum(["SKIP", "UPDATE"]).default("SKIP"),
});
export type ImportMapping = z.infer<typeof importMappingSchema>;

/** A CRM plan names the entity it was built for; the core plan does not. */
export type ImportPlan = CoreImportPlan & { entity: ImportEntity };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRow(entity: ImportEntity, values: Record<string, string>): ImportRowIssue[] {
  const issues: ImportRowIssue[] = [];

  for (const field of IMPORT_FIELDS[entity]) {
    if (field.required && !values[field.key]) {
      issues.push({ field: field.key, message: `${field.label} is required` });
    }
  }

  const email = values.email ?? values.contactEmail;
  if (email && !EMAIL_PATTERN.test(email)) {
    issues.push({ field: "email", message: `"${email}" doesn't look like an email address` });
  }

  if (values.estimatedValue && parseImportNumber(values.estimatedValue) === null) {
    issues.push({
      field: "estimatedValue",
      message: `"${values.estimatedValue}" isn't a number`,
    });
  }

  return issues;
}

/** A key two rows can share, used to spot duplicates inside the file itself. */
export function importRowKey(entity: ImportEntity, values: Record<string, string>): string | null {
  const email = (values.email ?? values.contactEmail ?? "").toLowerCase().trim();
  if (email) return `email:${email}`;
  if (entity === "COMPANY" && values.name) return `name:${values.name.toLowerCase().trim()}`;
  const phone = (values.phone ?? values.contactPhone ?? "").replace(/\D/g, "");
  if (phone) return `phone:${phone}`;
  return null;
}

/**
 * Build the plan.
 *
 * `findMatch` is passed in rather than queried here so this stays pure and the
 * caller decides how hard to look for an existing record.
 */
export function buildImportPlan(
  table: CsvTable,
  config: ImportMapping,
  findMatch: (values: Record<string, string>) => { id: string; label: string } | null = () => null,
): ImportPlan {
  const plan = buildPlan(table, {
    mapping: config.mapping,
    onDuplicate: config.onDuplicate,
    validate: (values) => validateRow(config.entity, values),
    rowKey: (values) => importRowKey(config.entity, values),
    findMatch,
    duplicateMessage: (firstLine) => `Same contact as row ${firstLine} in this file`,
  });

  return { entity: config.entity, ...plan };
}

export function parseImportFile(text: string): CsvTable {
  return parseCsv(text);
}

/** Imports are capped so one paste can't lock the table for everyone else. */
export const MAX_IMPORT_ROWS = 5000;
