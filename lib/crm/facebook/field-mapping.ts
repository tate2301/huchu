/**
 * Turning a lead form's answers into a CRM lead.
 *
 * Meta gives every question on a form a `name`: the standard ones are fixed
 * (`email`, `phone_number`, `full_name`), and a custom question gets a slug of
 * the question text — "What service do you need?" arrives as
 * `what_service_do_you_need?`. So the standard names can be mapped once, here,
 * and the custom ones cannot be mapped at all without knowing the form.
 *
 * Custom answers are therefore kept rather than guessed at: they go into the
 * lead's `details` under the question they answered, and into the message the
 * rep reads, as "What service do you need? — Borehole drilling". A field the
 * CRM has no column for is still the most useful thing on the form, and
 * dropping it to keep the mapper tidy would lose the reason the ad was run.
 */
import type { LeadFieldDatum } from "./graph";

/** Meta's standard field names, by what they mean to us. Listed rather than
 *  pattern-matched: these are a fixed vocabulary, and a regex over them would
 *  claim custom questions that merely contain the word "email". */
const EMAIL_FIELDS = ["email"];
const PHONE_FIELDS = ["phone_number", "phone"];
const FULL_NAME_FIELDS = ["full_name"];
const FIRST_NAME_FIELDS = ["first_name"];
const LAST_NAME_FIELDS = ["last_name"];
const COMPANY_FIELDS = ["company_name"];
const JOB_TITLE_FIELDS = ["job_title"];

/** Address parts, kept together under one key rather than spread across the
 *  lead — the CRM has no address on a lead, and six loose keys read worse than
 *  one line. */
const ADDRESS_FIELDS = [
  "street_address",
  "city",
  "state",
  "province",
  "country",
  "post_code",
  "zip_code",
];

export type MappedLead = {
  /** Never empty: falls back to the email, then the phone, then a placeholder,
   *  because `ingestLead` needs a contact name and a nameless lead is still a
   *  lead somebody has to call. */
  contactName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  jobTitle: string | null;
  address: string | null;
  /** Every answer, keyed by its question label. */
  answers: Record<string, string>;
  /** The custom answers as prose, for the activity body. Null when the form
   *  asked nothing beyond name and contact details. */
  message: string | null;
};

function firstValue(datum: LeadFieldDatum): string {
  return (datum.values ?? []).map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
}

/** "what_service_do_you_need?" → "What service do you need?" — the question
 *  as a human asked it, near enough, for a rep reading the lead. */
export function humanizeFieldName(name: string): string {
  const cleaned = name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return name;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function mapLeadFields(fieldData: LeadFieldDatum[] | undefined): MappedLead {
  const byName = new Map<string, string>();
  for (const datum of fieldData ?? []) {
    const name = String(datum?.name ?? "").trim().toLowerCase();
    if (!name) continue;
    const value = firstValue(datum);
    if (value) byName.set(name, value);
  }

  const pick = (names: string[]): string | null => {
    for (const name of names) {
      const value = byName.get(name);
      if (value) return value;
    }
    return null;
  };

  const email = pick(EMAIL_FIELDS);
  const phone = pick(PHONE_FIELDS);

  const fullName = pick(FULL_NAME_FIELDS);
  const firstLast = [pick(FIRST_NAME_FIELDS), pick(LAST_NAME_FIELDS)].filter(Boolean).join(" ").trim();
  const contactName = fullName || firstLast || email || phone || "Facebook lead";

  const addressParts = ADDRESS_FIELDS.map((name) => byName.get(name)).filter(Boolean) as string[];

  const handled = new Set([
    ...EMAIL_FIELDS,
    ...PHONE_FIELDS,
    ...FULL_NAME_FIELDS,
    ...FIRST_NAME_FIELDS,
    ...LAST_NAME_FIELDS,
    ...COMPANY_FIELDS,
    ...JOB_TITLE_FIELDS,
    ...ADDRESS_FIELDS,
  ]);

  const answers: Record<string, string> = {};
  const customLines: string[] = [];
  for (const [name, value] of byName) {
    const label = humanizeFieldName(name);
    answers[label] = value;
    if (!handled.has(name)) customLines.push(`${label} — ${value}`);
  }

  return {
    contactName,
    email,
    phone,
    companyName: pick(COMPANY_FIELDS),
    jobTitle: pick(JOB_TITLE_FIELDS),
    address: addressParts.length ? addressParts.join(", ") : null,
    answers,
    message: customLines.length ? customLines.join("\n") : null,
  };
}
