/**
 * Phone + email normalization for CRM dedupe.
 *
 * Phones are stored twice: `phone` (raw, as entered) and `phoneE164` (the
 * dedupe key). We deliberately avoid a heavyweight phone library — every CRM
 * capture surface (intake form, manual create, webhook) supplies a dial code
 * or a `+`-prefixed number, so a deterministic normalizer is enough and keeps
 * the client bundle small.
 *
 * E.164: a leading "+" followed by 8–15 digits, no separators.
 */

const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/**
 * Normalize a phone number to E.164, or return null if it cannot be resolved
 * to a plausible international number.
 *
 * - "+263 77 123 4567"            → "+263771234567"
 * - "0771234567" + defaultDialCode "263" (drops national trunk 0) → "+263771234567"
 * - "771234567"  + defaultDialCode "263" → "+263771234567"
 * - "263771234567" (no +, looks like it already carries a country code) → "+263771234567"
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  defaultDialCode?: string | null,
): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = digitsOnly(trimmed);
  if (!digits) return null;

  const dial = defaultDialCode ? digitsOnly(defaultDialCode) : "";

  if (!hasPlus) {
    if (dial) {
      // National format with a trunk prefix "0" → strip it before prefixing.
      if (digits.startsWith("0")) {
        digits = digits.replace(/^0+/, "");
      }
      // If the entered number doesn't already start with the dial code, add it.
      if (!digits.startsWith(dial)) {
        digits = `${dial}${digits}`;
      }
    }
    // Without a dial code we can only accept it if it already looks like it
    // carries a country code (i.e. long enough to be a full international
    // number). Otherwise it's ambiguous and we reject.
  }

  if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) {
    return null;
  }
  // E.164 numbers never start with 0.
  if (digits.startsWith("0")) return null;

  return `+${digits}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  // Minimal shape check — full RFC validation belongs to zod at the edge.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}
