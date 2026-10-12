/**
 * A customer's phone written one way (CUS-01), as the retail_customers
 * migration wrote every existing one: no spaces or dashes, and a Zimbabwean
 * number with +263 ("0774 123 388" → "+263774123388"). Anything else keeps
 * its digits and its +. Fewer than seven digits is not a number.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const compact = input.trim().replace(/[\s-]/g, "");
  if (!compact) return null;
  const digits = compact.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 7) throw new Error("Customer phone number looks invalid.");
  if (digits.startsWith("0")) return `+263${digits.slice(1)}`;
  if (digits.startsWith("263")) return `+${digits}`;
  return digits;
}
