import { z } from "zod";

/**
 * The rules of opening a shift that the sheet and the endpoint share
 * (00-foundations 5.7.8): the body's schema, the float's rule and the done
 * sentence. No database here, so the sheet kind can import it.
 */

/** Two decimals or fewer, zero or more: "100", "100.5", "100.00". */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

export const FLOAT_MESSAGE = "Give the float as an amount, like 100.00.";

/** The opening float as the sheet sends it. */
export const floatAmount = z.string().trim().regex(AMOUNT, FLOAT_MESSAGE);

export const openShiftSchema = z.object({
  registerId: z.string().uuid(),
  cashierId: z.string().uuid().optional(),
  openingFloat: z
    .union([z.number().min(0), floatAmount])
    .optional()
    .transform((value) => (value === undefined ? 0 : Number(value))),
  periodOverrideReason: z.string().max(500).optional().nullable(),
});

export type OpenShiftInput = z.infer<typeof openShiftSchema>;

/** "Back till" → "the back till"; "Handheld 1" → "Handheld 1". */
export function tillWords(name: string): string {
  return /^\S+ till$/i.test(name.trim()) ? `the ${name.trim().toLowerCase()}` : name.trim();
}

/** The done sentence: "SH-00243 open on the back till for Farai Moyo." */
export function shiftOpenedSentence(shift: { shiftNo: string; registerName: string; cashierName: string }): string {
  return `${shift.shiftNo} open on ${tillWords(shift.registerName)} for ${shift.cashierName}.`;
}
