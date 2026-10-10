import { z } from "zod";

/**
 * The rules of opening a shift that the sheet and the endpoint share
 * (00-foundations 5.7.8, FLR-03): the body's schema, the float's rule and the
 * done sentence. No database here, so the sheet kind can import it; the
 * opening itself is `lib/retail/floor/shifts.ts`.
 */

/**
 * Two decimals or fewer, zero or more: "100", "100.5", "100.00". Nine whole
 * digits at most, so the drawer's figures stay inside their numeric(14,2)
 * columns and a mistyped float is refused under its field, not by the database.
 */
export const FLOAT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

export const FLOAT_MESSAGE = "Give the float as an amount, like 100.00.";

/** A float as the sheet sends it. */
export const floatAmount = z.string().trim().regex(FLOAT_PATTERN, FLOAT_MESSAGE);

/**
 * `POST /api/v2/retail/shifts`. The floats are strings and checked by
 * `openShift`, so a bad one is refused under its own field.
 */
export const openShiftSchema = z.object({
  registerId: z.string().uuid(),
  cashierId: z.string().uuid().optional(),
  openingFloat: z.string().max(20),
  openingFloatZig: z.string().max(20).optional(),
  periodOverrideReason: z.string().max(500).optional().nullable(),
});

export type OpenShiftBody = z.infer<typeof openShiftSchema>;

/** "Back till" → "the back till"; "Handheld 1" → "Handheld 1". */
export function tillWords(name: string): string {
  return /^\S+ till$/i.test(name.trim()) ? `the ${name.trim().toLowerCase()}` : name.trim();
}

/** The done sentence: "SH-00243 open on the back till for Farai Moyo." */
export function shiftOpenedSentence(shift: { shiftNo: string; registerName: string; cashierName: string }): string {
  return `${shift.shiftNo} open on ${tillWords(shift.registerName)} for ${shift.cashierName}.`;
}
