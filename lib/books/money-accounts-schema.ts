import { z } from "zod";

/** A money account as Management's form sends it. */
export const moneyAccountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["BANK", "MOBILE", "CASH"]),
  currency: z.string().trim().min(3).max(3),
  bankName: z.string().max(200).nullish(),
  accountNumber: z.string().max(100).nullish(),
  accountName: z.string().max(200).nullish(),
  ledgerAccountId: z.string().uuid().nullish(),
  isFloat: z.boolean().optional(),
  imprestAmount: z.number().min(0).nullish(),
  holderId: z.string().uuid().nullish(),
  showOnDocuments: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  openingBalance: z.number().min(0).nullish(),
});
