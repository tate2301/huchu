import { normalizePhoneE164 } from "@/lib/crm/phone";

/**
 * A Zimbabwean mobile number, the one the setup link and renewal reminders go
 * to.
 *
 * Mobile only, because WhatsApp is: 71 (NetOne), 73 (Telecel), 77 and 78
 * (Econet), then seven digits. People type it every way — with the trunk 0,
 * with or without 263, with spaces — and it is stored once, in E.164.
 */
const ZIMBABWE_MOBILE = /^\+2637[1378]\d{7}$/;

export function normaliseZimbabweMobile(raw: string | null | undefined): string | null {
  const e164 = normalizePhoneE164(raw, "263");
  return e164 && ZIMBABWE_MOBILE.test(e164) ? e164 : null;
}
