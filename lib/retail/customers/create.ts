import { Prisma } from "@prisma/client";
import { z } from "zod";

import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

import { newCustomerNumbers } from "./numbers";
import { NOT_A_PHONE, normalizePhone } from "./phone";

/**
 * Adding a customer (CUS-02, W-45): from the Customers sheet, at the till and
 * from any customer field's quick add. One number, one live customer: the
 * check runs under an advisory lock on (company, phone) inside the
 * transaction, so two adds of one number cannot both pass.
 */

export const customerInput = z.object({
  phone: z.string(),
  name: z.string(),
  marketingConsent: z.boolean().default(false),
  dateOfBirth: z.string().optional(),
  area: z.string().max(80).optional(),
  via: z.enum(["sheet", "till", "lookup"]).default("sheet"),
});
export type CustomerInput = z.input<typeof customerInput>;

export const ADD_THEIR_NAME = "Add their name.";
export const DOB_WRONG = "Write it as 14 March 1988.";

export class CustomerRefusal extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly fieldErrors: Record<string, string>,
    readonly existing?: { id: string; name: string },
  ) {
    super(message);
    this.name = "CustomerRefusal";
  }
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function day(year: number, month: number, date: number): Date | null {
  const at = new Date(Date.UTC(year, month - 1, date));
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === date ? at : null;
}

/** "14 March 1988", "14/03/1988" or "1988-03-14" → that day (UTC midnight); null when it is none of them. */
export function parseBirthday(text: string): Date | null {
  const value = text.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) return day(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (match) return day(Number(match[3]), Number(match[2]), Number(match[1]));
  match = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(value);
  if (match) {
    const name = match[2]!.toLowerCase();
    const month = MONTHS.findIndex((candidate) => candidate === name || (name.length >= 3 && candidate.startsWith(name)));
    return month < 0 ? null : day(Number(match[3]), month + 1, Number(match[1]));
  }
  return null;
}

/** A birthday that is real: not in the future, and at most 120 years ago. Refused under `field`. */
export function birthdayOf(text: string | null | undefined, now: Date, field = "dob"): Date | null {
  if (!text?.trim()) return null;
  const parsed = parseBirthday(text);
  const oldest = new Date(Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate()));
  if (!parsed || parsed.getTime() > now.getTime() || parsed.getTime() < oldest.getTime()) {
    throw new CustomerRefusal(DOB_WRONG, 400, { [field]: DOB_WRONG });
  }
  return parsed;
}

export type CreatedCustomer = { id: string; code: string; name: string; phone: string; cardNo: string };

export async function createCustomer(
  tx: Prisma.TransactionClient,
  actor: RetailAuditActor,
  raw: CustomerInput,
  now: Date = new Date(),
): Promise<CreatedCustomer> {
  const input = customerInput.parse(raw);
  let phone: string | null;
  try {
    phone = normalizePhone(input.phone);
  } catch {
    phone = null;
  }
  const fieldErrors: Record<string, string> = {};
  if (!phone) fieldErrors.phone = NOT_A_PHONE;
  const name = input.name.trim();
  if (!name || name.length > 120) fieldErrors.name = ADD_THEIR_NAME;
  if (Object.keys(fieldErrors).length) {
    throw new CustomerRefusal(Object.values(fieldErrors)[0]!, 400, fieldErrors);
  }
  const dateOfBirth = birthdayOf(input.dateOfBirth, now);
  const area = input.area?.trim() || null;

  const companyId = actor.companyId;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`retail-customer:${companyId}:${phone}`}))::text`;
  const holder = await tx.customer.findFirst({
    where: { companyId, phone, archivedAt: null, mergedIntoId: null },
    select: { id: true, name: true },
  });
  if (holder) {
    const sentence = `${holder.name} already has this number.`;
    throw new CustomerRefusal(sentence, 409, { phone: sentence }, holder);
  }

  // A code or card already taken (a customer added by hand) takes the next number, up to five times.
  let numbers = await newCustomerNumbers(tx, companyId);
  for (let tries = 1; tries < 5; tries += 1) {
    const taken = await tx.customer.findFirst({
      where: { companyId, OR: [{ code: numbers.code }, { cardNo: numbers.cardNo }] },
      select: { id: true },
    });
    if (!taken) break;
    numbers = await newCustomerNumbers(tx, companyId);
  }

  const created = await tx.customer.create({
    data: {
      companyId,
      code: numbers.code,
      cardNo: numbers.cardNo,
      name,
      phone,
      marketingConsent: input.marketingConsent,
      consentChangedAt: input.marketingConsent ? now : null,
      dateOfBirth,
      area,
      createdById: actor.userId,
    },
    select: { id: true, code: true, name: true, phone: true, cardNo: true },
  });
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.customerCreated,
    entityType: "Customer",
    entityId: created.id,
    payload: { code: created.code, name: created.name, consent: input.marketingConsent, via: input.via },
  });
  return { id: created.id, code: created.code!, name: created.name, phone: created.phone!, cardNo: created.cardNo! };
}
