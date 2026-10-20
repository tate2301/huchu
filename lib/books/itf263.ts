/**
 * A supplier's tax clearance (ITF263, D17) in words, pure: no database, so
 * client components can use it. Valid with a number and an expiry on or after
 * the day (none recorded counts as valid); expired; none on file.
 */

export type Itf263State = "Valid" | "Expired" | "None";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (date: Date) => `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

export function itf263State(vendor: { itf263Number: string | null; itf263ExpiresAt: Date | string | null }, on: Date): { state: Itf263State; label: string; expires: string | null } {
  if (!vendor.itf263Number?.trim()) return { state: "None", label: "None on file", expires: null };
  const expires = vendor.itf263ExpiresAt ? new Date(vendor.itf263ExpiresAt) : null;
  if (!expires) return { state: "Valid", label: "Valid", expires: null };
  const valid = expires.getTime() >= Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate());
  return valid ? { state: "Valid", label: `Valid to ${day(expires)}`, expires: day(expires) } : { state: "Expired", label: `Expired ${day(expires)}`, expires: day(expires) };
}
