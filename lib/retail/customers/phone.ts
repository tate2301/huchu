import { normalizePhoneE164 } from "@/lib/crm/phone";

/**
 * A customer's phone written one way (CUS-01, CUS-02): E.164, a Zimbabwean
 * number from "0774 123 388", "263…" or "+263…" → "+263774123388"
 * (`normalizePhoneE164` with Zimbabwe's dial code). Blank is null; anything
 * that is not a number throws.
 */
export const NOT_A_PHONE = "That is not a phone number.";

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const e164 = normalizePhoneE164(input, "263");
  if (!e164) throw new Error(NOT_A_PHONE);
  return e164;
}
