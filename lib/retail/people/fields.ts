import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { normaliseZimbabweMobile } from "@/lib/signup/whatsapp-number";

import { PERSON_ROLES, needsEmail, type PersonRole } from "./roles";

/**
 * The field rules Invite someone and a person's sheet share (80-admin W-57,
 * **Defined here**): each refusal under its field, all at once.
 */

type Client = Prisma.TransactionClient | typeof prisma;

export const NAME_NEEDED = "Write their name.";
export const PHONE_WRONG = "Write a mobile number such as +263 77 123 4567.";
export const EMAIL_WRONG = "That email does not look right.";
export const EMAIL_TAKEN = "Someone already signs in with that email.";
export const EMAIL_NEEDED = "Owners and bookkeepers sign in to the admin, so they need an email.";
export const EMAIL_NEEDED_ON_FILE =
  "Owners and bookkeepers sign in to the admin, so they need an email. Invite them again with one.";
export const NO_WAY_IN = "Give them an email or a till PIN, or they cannot get in.";

const sites = z.union([z.literal("ALL"), z.array(z.string().uuid()).max(100)]);

export const inviteInput = z.object({
  name: z.string().max(500).default(""),
  phone: z.string().max(60).default(""),
  email: z.string().max(320).nullish(),
  role: z.enum(PERSON_ROLES),
  sites,
  givePin: z.boolean().default(false),
  /** Only from onboarding (SET-12): the owner typed the PIN. */
  pin: z.string().max(10).nullish(),
});
export type InviteInput = z.infer<typeof inviteInput>;

export const changeInput = z.object({
  name: z.string().max(500).optional(),
  phone: z.string().max(60).optional(),
  role: z.enum(PERSON_ROLES).optional(),
  sites: sites.optional(),
  sendNewPin: z.boolean().optional(),
});
export type ChangeInput = z.infer<typeof changeInput>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 120 ? name : null;
}

/** The phone in E.164, or the refusal; taken by another of the company's people names them. */
export async function checkPhone(
  companyId: string,
  raw: string,
  except: string | null,
  client: Client = prisma,
): Promise<{ phone: string } | { error: string }> {
  const phone = normaliseZimbabweMobile(raw);
  if (!phone) return { error: PHONE_WRONG };
  const holder = await client.user.findFirst({
    where: { companyId, phone, ...(except ? { id: { not: except } } : {}) },
    select: { name: true },
  });
  return holder ? { error: `${holder.name} already has that number.` } : { phone };
}

/** The email lower-cased, null when none; or the refusal. */
export async function checkEmail(
  raw: string | null | undefined,
  role: PersonRole,
  client: Client = prisma,
): Promise<{ email: string | null } | { error: string }> {
  const email = raw?.trim().toLowerCase() || null;
  if (!email) return needsEmail(role) ? { error: EMAIL_NEEDED } : { email: null };
  if (!EMAIL.test(email) || email.length > 320) return { error: EMAIL_WRONG };
  const taken = await client.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  return taken ? { error: EMAIL_TAKEN } : { email };
}
