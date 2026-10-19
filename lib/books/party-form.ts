import { z } from "zod";

/**
 * A customer or a supplier, from Books' drawer (books-final §3.3: name,
 * contact, VAT number, TIN, address). Pure, so the drawer and the route
 * check the same way.
 */
export const partySchema = z.object({
  name: z.string().trim().min(1, "Give them a name.").max(200),
  contactName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.union([z.literal(""), z.string().trim().email("That email address is not complete.")]).optional(),
  address: z.string().trim().max(300).optional(),
  vatNumber: z.string().trim().max(100).optional(),
  taxNumber: z.string().trim().max(100).optional(),
});

export type PartyInput = z.infer<typeof partySchema>;

export type PartyForm = { name: string; contactName: string; phone: string; email: string; address: string; vatNumber: string; taxNumber: string };

export const EMPTY_PARTY: PartyForm = { name: "", contactName: "", phone: "", email: "", address: "", vatNumber: "", taxNumber: "" };

/** What is wrong, by field. Empty when it can go. */
export function partyErrors(form: PartyForm): Record<string, string> {
  const parsed = partySchema.safeParse(form);
  if (parsed.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Only what was filled in: an empty field stays empty in the record. */
export function partyData(input: PartyInput) {
  const keep = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    name: input.name.trim(),
    contactName: keep(input.contactName),
    phone: keep(input.phone),
    email: keep(input.email),
    address: keep(input.address),
    vatNumber: keep(input.vatNumber),
    taxNumber: keep(input.taxNumber),
  };
}
