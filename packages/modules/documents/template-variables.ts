/**
 * The values a template can drop into its text.
 *
 * A quote that says "Dear {{contact.name}}" is a quote you write once. The
 * alternative — a template per customer, or a person editing the same three
 * sentences forty times a month — is what this replaces, and it is also how
 * the wrong customer's name ends up on somebody's invoice.
 *
 * The catalogue is explicit rather than "any path on the record" on purpose.
 * A variable somebody can type but nothing fills is worse than one that does
 * not exist: it renders as a blank the sender never notices, and the customer
 * reads a letter addressed to nobody. The picker offers only what resolves.
 */

export type VariableGroup =
  | "company"
  | "customer"
  | "contact"
  | "record"
  | "document"
  | "user"
  | "date";

export type VariableDefinition = {
  /** What somebody types: `{{company.name}}`. */
  key: string;
  label: string;
  group: VariableGroup;
  /** Shown in the picker so the shape is obvious before it is used. */
  example: string;
};

export const VARIABLE_GROUP_LABELS: Record<VariableGroup, string> = {
  company: "Your company",
  customer: "The customer",
  contact: "The contact",
  record: "The record",
  document: "The document",
  user: "Whoever is sending it",
  date: "Dates",
};

export const VARIABLE_CATALOGUE: VariableDefinition[] = [
  { key: "company.name", label: "Company name", group: "company", example: "Ridgeline Roofing" },
  { key: "company.email", label: "Company email", group: "company", example: "hello@ridgeline.co" },
  { key: "company.phone", label: "Company phone", group: "company", example: "+263 77 000 0000" },
  { key: "company.address", label: "Company address", group: "company", example: "12 Samora Machel Ave" },
  { key: "company.taxNumber", label: "Tax number", group: "company", example: "1000123456" },
  { key: "company.website", label: "Website", group: "company", example: "ridgeline.co" },

  { key: "customer.name", label: "Customer name", group: "customer", example: "Beacon Properties" },
  { key: "customer.reference", label: "Customer reference", group: "customer", example: "CL-0042" },
  { key: "customer.address", label: "Customer address", group: "customer", example: "8 Enterprise Rd" },
  { key: "customer.email", label: "Customer email", group: "customer", example: "ap@beacon.co" },
  { key: "customer.phone", label: "Customer phone", group: "customer", example: "+263 71 111 1111" },

  { key: "contact.name", label: "Contact name", group: "contact", example: "Tendai Moyo" },
  { key: "contact.firstName", label: "Contact first name", group: "contact", example: "Tendai" },
  { key: "contact.jobTitle", label: "Contact job title", group: "contact", example: "Facilities Manager" },
  { key: "contact.email", label: "Contact email", group: "contact", example: "tendai@beacon.co" },
  { key: "contact.phone", label: "Contact phone", group: "contact", example: "+263 71 222 2222" },

  { key: "record.title", label: "Record title", group: "record", example: "Warehouse re-roof" },
  { key: "record.reference", label: "Record number", group: "record", example: "DL-0119" },
  { key: "record.stage", label: "Stage", group: "record", example: "Quoted" },
  { key: "record.value", label: "Value", group: "record", example: "$18,400.00" },
  { key: "record.owner", label: "Owner", group: "record", example: "Rufaro Chikoore" },

  { key: "document.number", label: "Document number", group: "document", example: "QTN-0031" },
  { key: "document.total", label: "Total", group: "document", example: "$18,400.00" },
  { key: "document.subtotal", label: "Subtotal", group: "document", example: "$16,000.00" },
  { key: "document.tax", label: "Tax", group: "document", example: "$2,400.00" },
  { key: "document.balance", label: "Balance owing", group: "document", example: "$8,400.00" },
  { key: "document.currency", label: "Currency", group: "document", example: "USD" },
  { key: "document.validUntil", label: "Valid until", group: "document", example: "14 August 2026" },

  { key: "user.name", label: "Your name", group: "user", example: "Rufaro Chikoore" },
  { key: "user.email", label: "Your email", group: "user", example: "rufaro@ridgeline.co" },

  { key: "date.today", label: "Today", group: "date", example: "28 July 2026" },
  { key: "date.year", label: "This year", group: "date", example: "2026" },
];

const CATALOGUE_KEYS = new Set(VARIABLE_CATALOGUE.map((entry) => entry.key));

export type VariableValues = Record<string, string | null | undefined>;

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Every variable a body uses, whether or not it resolves. */
export function usedVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

/** Variables somebody typed that nothing will ever fill. */
export function unknownVariables(text: string): string[] {
  return usedVariables(text).filter((key) => !CATALOGUE_KEYS.has(key));
}

/**
 * Fill a body in.
 *
 * A variable with no value renders as its `fallback`, which defaults to an
 * em dash rather than an empty string. A blank in the middle of a sentence
 * reads as a typo somebody made; a dash reads as a fact nobody had, which is
 * what it is.
 */
export function resolveVariables(
  text: string,
  values: VariableValues,
  options?: { fallback?: string; keepUnknown?: boolean },
): string {
  const fallback = options?.fallback ?? "—";

  return text.replace(VARIABLE_PATTERN, (raw, key: string) => {
    if (!CATALOGUE_KEYS.has(key)) {
      // An unknown variable is somebody's typo. Leaving it visible in a draft
      // is how they find it; silently blanking it is how a customer does.
      return options?.keepUnknown === false ? fallback : raw;
    }
    const value = values[key];
    if (value === null || value === undefined || value === "") return fallback;
    return value;
  });
}

/** Group the catalogue for a picker. */
export function groupedVariables(): Array<{
  group: VariableGroup;
  label: string;
  entries: VariableDefinition[];
}> {
  const order: VariableGroup[] = [
    "company",
    "customer",
    "contact",
    "record",
    "document",
    "user",
    "date",
  ];

  return order
    .map((group) => ({
      group,
      label: VARIABLE_GROUP_LABELS[group],
      entries: VARIABLE_CATALOGUE.filter((entry) => entry.group === group),
    }))
    .filter((bucket) => bucket.entries.length > 0);
}

/** A sample fill, so the editor can preview without a record selected. */
export function sampleValues(): VariableValues {
  return Object.fromEntries(
    VARIABLE_CATALOGUE.map((entry) => [entry.key, entry.example]),
  );
}
