import { z } from "zod";

import { parseDay } from "@/lib/workspace/format";

/**
 * The requests the order routes take (40-buying 4.3), as the sheets send
 * them. A line names its product; the server finds its stock line at the
 * order's site. Dates are shop days, `YYYY-MM-DD` (or typed, "7 October 2026").
 */

const DATE_WORDS = "Write a date, like 7 October 2026.";

const day = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : parseDay(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: DATE_WORDS });
      return z.NEVER;
    }
    return parsed;
  });

const line = z.object({
  id: z.string().uuid().nullish(),
  productId: z.string().uuid(),
  quantity: z.union([z.number(), z.string()]),
  unitCost: z.union([z.number(), z.string()]),
});

export const raiseSchema = z.object({
  supplierId: z.string().uuid({ message: "Choose who you are ordering from." }),
  siteId: z.string().uuid({ message: "Choose where it is delivered." }),
  expectedDate: day.nullish(),
  lines: z.array(line).max(200).default([]),
  payment: z.enum(["ON_ACCOUNT", "CASH_ON_DELIVERY"]).default("ON_ACCOUNT"),
  askForCash: z.boolean().default(false),
  noteToSupplier: z.string().max(500, "Keep it to 500 characters.").nullish(),
  send: z.boolean(),
});

export const changeSchema = z.object({
  expectedDate: day.nullish(),
  siteId: z.string().uuid().optional(),
  lines: z.array(line).max(200).optional(),
  tell: z.boolean().optional(),
  supplierId: z.string().uuid().optional(),
  payment: z.enum(["ON_ACCOUNT", "CASH_ON_DELIVERY"]).optional(),
});

export const sendSchema = z.object({
  via: z.enum(["WHATSAPP", "EMAIL", "BY_HAND"]).optional(),
  /** Confirms Vane's draft as the sender's own: they become its maker as it goes (`lib/vane/drafts.ts`). */
  asMine: z.boolean().optional(),
});

export const closeSchema = z.object({ note: z.string().trim().max(500).nullish() });

/** "Send a reminder" (W-34): who, what, the day promised and what happens if it does not come. */
export const chaseSchema = z.object({
  contactId: z.string().uuid().nullable(),
  message: z.string().trim().min(1, "Write the message.").max(1000, "Keep it to 1,000 characters."),
  promisedFor: day,
  then: z.enum(["REMIND", "CANCEL_REST"]).default("REMIND"),
});

export const cancelRestSchema = z.object({ tell: z.literal(true).default(true) });

/** Orders' bulk actions: the ticked orders. */
export const bulkOrdersSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "Tick at least one order.").max(100, "Tick at most 100 orders.") });

/** The request's keys as the order sheets' field ids. */
const SHEET_FIELD: Record<string, string> = {
  supplierId: "sup",
  siteId: "site",
  expectedDate: "exp",
  noteToSupplier: "msg",
  askForCash: "ask",
  contactId: "to",
  message: "msg",
  promisedFor: "new",
};

/** Zod's issues as the sheet's field errors, first message per field. */
export function issuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const raw = String(issue.path[0] ?? "form");
    const key = SHEET_FIELD[raw] ?? raw;
    fields[key] ??= raw === "lines" ? "Each line needs a quantity." : issue.message;
  }
  return fields;
}
