import { z } from "zod";

import { parseDay } from "@/lib/workspace/format";

import { REJECT_REASONS } from "./requisition-words";

/**
 * The requests the requisition routes take (40-buying 4.5), as the sheets
 * send them. Money is a string with two decimals (or a number); days are
 * shop days, `YYYY-MM-DD` (or typed, "6 October 2026").
 */

const day = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : parseDay(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Write a date, like 6 October 2026." });
      return z.NEVER;
    }
    return parsed;
  });

const amount = z.union([z.number(), z.string().trim().min(1, "Write the amount, like 85.00.")]);

const file = z.object({
  url: z.string().url(),
  name: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

export const askSchema = z.object({
  for: z.enum(["order", "expense"]),
  orderId: z.string().uuid().nullish(),
  expenseTypeId: z.string().uuid().nullish(),
  whatFor: z.string().max(400).nullish(),
  amount,
  currency: z.enum(["US$", "ZiG"]).default("US$"),
  payFromId: z.string().uuid().nullish(),
  payToId: z.string().uuid().nullish(),
  neededBy: day.nullish(),
  why: z.string().max(2000).nullish(),
  quote: file.nullish(),
});

export const patchSchema = z
  .object({
    amount: amount.optional(),
    payFromId: z.string().uuid().nullable().optional(),
    payToId: z.string().uuid().nullable().optional(),
    neededBy: day.nullable().optional(),
    whatFor: z.string().max(400).optional(),
    expenseTypeId: z.string().uuid().optional(),
  })
  .refine((body) => Object.keys(body).length === 1, { message: "Change one thing at a time." });

export const approveSchema = z.object({ amount: amount.nullish(), note: z.string().max(2000).nullish() });

export const rejectSchema = z.object({
  reason: z.enum(REJECT_REASONS, { message: "Choose why." }),
  message: z.string().max(2000).nullish(),
});

export const questionSchema = z.object({ message: z.string().max(1000) });

export const paySchema = z.object({
  paid: amount,
  fromId: z.string().uuid().nullish(),
  toId: z.string().uuid().nullish(),
  how: z.enum(["Cash", "Bank transfer", "EcoCash"], { message: "Choose how it is paid." }),
  reference: z.string().max(200).nullish(),
});

/** One requisition of the stepping sheet's bulk "Pay out": the same body and its id. */
export const bulkPaySchema = paySchema.extend({ id: z.string().uuid() });

export const acquitSchema = z.object({
  spent: amount,
  changeIntoId: z.string().uuid().nullish(),
  receipts: z.array(file).max(20, "Add at most 20 files.").default([]),
  note: z.string().max(2000).nullish(),
});

export const bulkSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "Tick at least one requisition.").max(100, "Tick at most 100 requisitions.") });
export const bulkRejectSchema = rejectSchema.extend({ ids: bulkSchema.shape.ids });

/** The request's keys as the requisition sheets' field ids (5.18–5.21). */
const SHEET_FIELD: Record<string, string> = {
  for: "purpose",
  orderId: "po",
  expenseTypeId: "cat",
  whatFor: "what",
  amount: "amt",
  currency: "cur",
  payFromId: "from",
  payToId: "to",
  neededBy: "by",
  why: "why",
  quote: "q",
  note: "why",
  reason: "why",
  message: "msg",
  paid: "paid",
  fromId: "from",
  toId: "to",
  how: "how",
  reference: "ref",
  spent: "spent",
  changeIntoId: "into",
  receipts: "rec",
};

/** Zod's issues as the sheet's field errors, first message per field. */
export function requisitionIssues(error: z.ZodError, sheet = true): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const raw = String(issue.path[0] ?? "form");
    const key = sheet ? (SHEET_FIELD[raw] ?? raw) : raw;
    fields[key] ??= issue.message;
  }
  return fields;
}
