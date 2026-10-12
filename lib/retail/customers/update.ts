import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { loadLoyaltySettings } from "@/lib/retail/loyalty/settings";
import { spendOverYear } from "@/lib/retail/loyalty/ledger";
import { tierFor } from "@/lib/retail/loyalty/tiers";
import { phoneDisplay } from "@/lib/retail/people/words";
import { addMonths } from "@/lib/retail/vouchers/dates";
import { formatDay, todayIn } from "@/lib/workspace/format";

import { ADD_THEIR_NAME, birthdayOf, CustomerRefusal } from "./create";
import { NOT_A_PHONE, normalizePhone } from "./phone";

/**
 * Changing a customer (CUS-03, W-62): from the rail one value at a time, or
 * from Edit everything with every changed field at once. Each field follows
 * New customer's rule; every change is one `RETAIL_RECORD.EDITED` (the tier a
 * `RETAIL_CUSTOMER.TIER_SET`, consent a `RETAIL_CUSTOMER.CONSENT_CHANGED`),
 * all in the caller's transaction. A customer in the bin is not changed.
 */

export const customerPatch = z
  .object({
    name: z.string(),
    phone: z.string(),
    whatsapp: z.string().nullable(),
    email: z.string().nullable(),
    area: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    marketingConsent: z.boolean(),
    cardNo: z.string(),
    tier: z.string(),
    priceListId: z.string().uuid().nullable(),
    /** Where a consent change was made: the record's ⋯, or the Edit everything sheet. */
    via: z.enum(["record", "sheet"]),
  })
  .partial()
  .strict();
export type CustomerPatch = z.input<typeof customerPatch>;

export const NOT_AN_EMAIL = "That is not an email address.";
export const CARD_DIGITS = "A card number is 12 digits.";
export const NOT_A_TIER = "That is not a tier.";
export const NOT_THIS_SHOPS_LIST = "That price list is not this shop’s.";
export const RESTORE_FIRST = "Restore it to change it";
export const CHANGE_SOMETHING = "Change something first.";
export const AREA_TOO_LONG = "Keep the area under 80 characters.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The labels Activity reads ("Changed Area from Mbare, Harare to Mbare"). */
const LABELS: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  area: "Area",
  dateOfBirth: "Date of birth",
  cardNo: "Card",
  priceListId: "Price list",
};

export type CustomerChange = { field: string; from: string | null; to: string | null };

const blank = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
const dayOf = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const cardWords = (card: string | null) => (card ? card.replace(/(\d{4})(?=\d)/g, "$1 ") : null);

function phoneOf(text: string, field: string): string {
  let phone: string | null = null;
  try {
    phone = normalizePhone(text);
  } catch {
    phone = null;
  }
  if (!phone) throw new CustomerRefusal(NOT_A_PHONE, 400, { [field]: NOT_A_PHONE });
  return phone;
}

export async function updateCustomer(
  tx: Prisma.TransactionClient,
  actor: RetailAuditActor,
  id: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<CustomerChange[]> {
  const parsed = customerPatch.safeParse(raw ?? {});
  if (!parsed.success) throw new CustomerRefusal("Validation failed", 400, {});
  const input = parsed.data;
  const { via = "record", ...fields } = input;
  if (Object.keys(fields).length === 0) throw new CustomerRefusal(CHANGE_SOMETHING, 400, {});

  const companyId = actor.companyId;
  await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  const customer = await tx.customer.findFirst({
    where: { id, companyId },
    select: {
      name: true,
      phone: true,
      whatsapp: true,
      email: true,
      area: true,
      dateOfBirth: true,
      marketingConsent: true,
      cardNo: true,
      tierHeld: true,
      tierHeldUntil: true,
      archivedAt: true,
      mergedIntoId: true,
      priceList: { select: { id: true, name: true } },
    },
  });
  if (!customer) throw new CustomerRefusal("Customer not found", 404, {});
  if (customer.archivedAt || customer.mergedIntoId) throw new CustomerRefusal(RESTORE_FIRST, 409, {});

  // Every field's own rule first, all of them together.
  const errors: Record<string, string> = {};
  const data: Prisma.CustomerUpdateInput = {};
  const changes: Array<CustomerChange & { label: string }> = [];
  const change = (field: string, from: string | null, to: string | null) => {
    if (from !== to) changes.push({ field, label: LABELS[field]!, from, to });
  };
  const attempt = (run: () => void) => {
    try {
      run();
    } catch (error) {
      if (error instanceof CustomerRefusal) Object.assign(errors, error.fieldErrors);
      else throw error;
    }
  };

  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name || name.length > 120) errors.name = ADD_THEIR_NAME;
    else if (name !== customer.name) {
      data.name = name;
      change("name", customer.name, name);
    }
  }
  let phone: string | null = null;
  if (fields.phone !== undefined) {
    attempt(() => {
      phone = phoneOf(fields.phone!, "phone");
    });
    if (phone && phone !== customer.phone) {
      data.phone = phone;
      change("phone", phoneDisplay(customer.phone) || null, phoneDisplay(phone));
    } else phone = null;
  }
  if (fields.whatsapp !== undefined) {
    attempt(() => {
      const typed = blank(fields.whatsapp);
      let whatsapp = typed ? phoneOf(typed, "whatsapp") : null;
      // The phone itself is "Same number".
      if (whatsapp && whatsapp === (phone ?? customer.phone)) whatsapp = null;
      if (whatsapp !== customer.whatsapp) {
        data.whatsapp = whatsapp;
        change("whatsapp", customer.whatsapp ? phoneDisplay(customer.whatsapp) : "Same number", whatsapp ? phoneDisplay(whatsapp) : "Same number");
      }
    });
  }
  if (fields.email !== undefined) {
    const email = blank(fields.email)?.toLowerCase() ?? null;
    if (email && (!EMAIL.test(email) || email.length > 160)) errors.email = NOT_AN_EMAIL;
    else if (email !== customer.email) {
      data.email = email;
      change("email", customer.email, email);
    }
  }
  if (fields.area !== undefined) {
    const area = blank(fields.area);
    if (area && area.length > 80) errors.area = AREA_TOO_LONG;
    else if (area !== customer.area) {
      data.area = area;
      change("area", customer.area, area);
    }
  }
  if (fields.dateOfBirth !== undefined) {
    attempt(() => {
      const born = birthdayOf(fields.dateOfBirth, now, "dateOfBirth");
      const before = dayOf(customer.dateOfBirth);
      const after = dayOf(born);
      if (after !== before) {
        data.dateOfBirth = born;
        change("dateOfBirth", before ? formatDay(before) : null, after ? formatDay(after) : null);
      }
    });
  }
  let card: string | null = null;
  if (fields.cardNo !== undefined) {
    const digits = fields.cardNo.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(digits)) errors.cardNo = CARD_DIGITS;
    else if (digits !== customer.cardNo) card = digits;
  }
  let tier: { name: string; until: string | null } | null = null;
  const settings = fields.tier !== undefined ? await loadLoyaltySettings(companyId, tx) : null;
  if (fields.tier !== undefined && settings) {
    const name = fields.tier.trim();
    if (!settings.tiers.some((entry) => entry.name === name)) errors.tier = NOT_A_TIER;
    else {
      const today = todayIn(undefined, now);
      const spend12m = await spendOverYear(tx, companyId, id, now);
      const bySpend = tierFor({ spend12m, settings, held: null, today });
      const heldUntil = dayOf(customer.tierHeldUntil);
      const held = customer.tierHeld && heldUntil && heldUntil >= today ? { name: customer.tierHeld, until: heldUntil } : null;
      if (name === bySpend) {
        // The tier their spend gives: any hold goes.
        if (held || customer.tierHeld) tier = { name, until: null };
      } else if (!held || held.name !== name) {
        tier = { name, until: addMonths(today, 12) };
      }
    }
  }
  let list: { id: string; name: string } | null | undefined;
  if (fields.priceListId !== undefined) {
    if (fields.priceListId === null) list = null;
    else {
      const found = await tx.priceList.findFirst({
        where: { id: fields.priceListId, companyId, archivedAt: null },
        select: { id: true, name: true },
      });
      if (!found) errors.priceListId = NOT_THIS_SHOPS_LIST;
      else list = found;
    }
    if (list !== undefined && (list?.id ?? null) !== (customer.priceList?.id ?? null)) {
      data.priceList = list ? { connect: { id: list.id } } : { disconnect: true };
      change("priceListId", customer.priceList?.name ?? null, list?.name ?? null);
    }
  }
  if (Object.keys(errors).length) throw new CustomerRefusal(Object.values(errors)[0]!, 400, errors);

  // Then what another customer holds: their number, their card.
  if (phone) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`retail-customer:${companyId}:${phone}`}))::text`;
    const holder = await tx.customer.findFirst({
      where: { companyId, phone, archivedAt: null, mergedIntoId: null, id: { not: id } },
      select: { id: true, name: true },
    });
    if (holder) {
      const sentence = `${holder.name} already has this number.`;
      throw new CustomerRefusal(sentence, 409, { phone: sentence }, holder);
    }
  }
  if (card) {
    const holder = await tx.customer.findFirst({ where: { companyId, cardNo: card, id: { not: id } }, select: { id: true, name: true } });
    if (holder) {
      const sentence = `That card is ${holder.name}’s.`;
      throw new CustomerRefusal(sentence, 409, { cardNo: sentence }, holder);
    }
    data.cardNo = card;
    change("cardNo", cardWords(customer.cardNo), cardWords(card));
  }

  const consent = fields.marketingConsent !== undefined && fields.marketingConsent !== customer.marketingConsent ? fields.marketingConsent : null;
  if (consent !== null) {
    data.marketingConsent = consent;
    data.consentChangedAt = now;
  }
  if (tier) {
    data.tierHeld = tier.until ? tier.name : null;
    data.tierHeldUntil = tier.until ? new Date(`${tier.until}T00:00:00Z`) : null;
  }
  if (Object.keys(data).length === 0) return [];

  await tx.customer.update({ where: { id }, data });
  for (const entry of changes) {
    await auditRecordEdited(tx, {
      actor,
      entityType: "Customer",
      entityId: id,
      field: entry.field,
      label: entry.label,
      from: entry.from,
      to: entry.to,
    });
  }
  if (consent !== null) {
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.customerConsent,
      entityType: "Customer",
      entityId: id,
      payload: { agreed: consent, via },
    });
  }
  if (tier) {
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.customerTierSet,
      entityType: "Customer",
      entityId: id,
      payload: { tier: tier.name, until: tier.until },
    });
  }
  return [
    ...changes.map(({ field, from, to }) => ({ field, from, to })),
    ...(consent !== null ? [{ field: "marketingConsent", from: consent ? "No" : "Yes", to: consent ? "Yes" : "No" }] : []),
    ...(tier ? [{ field: "tier", from: customer.tierHeld, to: tier.name }] : []),
  ];
}
