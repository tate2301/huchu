import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildWorkspaceUrl } from "@/lib/platform/tenant-url";
import { clearUserFeatureOverrides } from "@/lib/platform/user-entitlements";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";
import { sendWhatsAppNow, type Sent } from "@/lib/retail/messages/send-now";

import { viewerOf, type PeopleActor } from "./actor";
import { shopName } from "./deliver";
import { checkEmail, checkPhone, cleanName, NAME_NEEDED, NO_WAY_IN, type InviteInput } from "./fields";
import { issueTillPin } from "./pins";
import { fieldRefusal, PeopleRefusal } from "./refusal";
import { rolesCallerMayGive, roleInSentence, userRoleOf, type PersonRole } from "./roles";
import { checkSitesInto, siteScopeOf, writeSites } from "./scope";
import { loadPerson, type PersonView } from "./view";

/**
 * Inviting someone (80-admin W-57, "Send the invite"): the person is made at
 * once, with a WhatsApp link that works for 7 days and, when asked, a till
 * PIN. The one service onboarding (SET-12) and the person lookup's quick add
 * call too.
 */

export const INVITE_DAYS = 7;
export const ROLE_REFUSAL_ADD = "Managers add cashiers and stock clerks only.";

/** Only the token's SHA-256 is kept. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** What happens when WhatsApp did not take it: the link and PIN for whoever issued them, shown once. */
export type HandOver = { link: string | null; pin: string | null };

export type InviteResult = { data: PersonView; sent: Sent; handOver?: HandOver };

async function joinLink(companyId: string, requestUrl: string, token: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  return buildWorkspaceUrl({ slug: company?.slug ?? "", path: `/join/${token}`, currentUrl: requestUrl }).toString();
}

/**
 * The invite's words: "Tendai Mhlanga added you to Harare Bottle Store as a
 * cashier. Join: <link> (it works for 7 days). Your till PIN is 4829; you
 * choose your own the first time you use it."
 */
export function inviteMessage(input: {
  inviter: string;
  shop: string;
  role: PersonRole;
  link: string;
  pin: string | null;
}): string {
  const pin = input.pin ? ` Your till PIN is ${input.pin}; you choose your own the first time you use it.` : "";
  return `${input.inviter} added you to ${input.shop} as ${roleInSentence(input.role)}. Join: ${input.link} (it works for ${INVITE_DAYS} days).${pin}`;
}

/** A new invite inside the caller's transaction; the raw token goes back for the link. */
async function newInvite(
  tx: Prisma.TransactionClient,
  input: { companyId: string; userId: string; invitedById: string; sentTo: string; now: Date },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await tx.retailStaffInvite.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      invitedById: input.invitedById,
      tokenHash: hashInviteToken(token),
      sentTo: input.sentTo,
      expiresAt: new Date(input.now.getTime() + INVITE_DAYS * 86_400_000),
    },
  });
  return token;
}

/** Send the invite after commit; a failed send gives the link and PIN back to the caller. */
async function sendInvite(input: {
  actor: PeopleActor;
  userId: string;
  role: PersonRole;
  phone: string;
  token: string;
  pin: string | null;
}): Promise<{ sent: Sent; handOver?: HandOver }> {
  const { actor } = input;
  const link = await joinLink(actor.companyId, actor.requestUrl, input.token);
  const body = inviteMessage({
    inviter: actor.userName ?? "The shop",
    shop: await shopName(actor.companyId),
    role: input.role,
    link,
    pin: input.pin,
  });
  const sent = await sendWhatsAppNow({
    companyId: actor.companyId,
    to: input.phone,
    template: "staff-invite",
    body,
    secrets: [input.token, ...(input.pin ? [input.pin] : [])],
    createdById: actor.userId,
  });
  return sent.whatsapp ? { sent } : { sent, handOver: { link, pin: input.pin } };
}

export async function invitePerson(actor: PeopleActor, input: InviteInput, now = new Date()): Promise<InviteResult> {
  if (!rolesCallerMayGive(actor.roleKey).includes(input.role)) throw new PeopleRefusal(ROLE_REFUSAL_ADD, 403);

  const fieldErrors: Record<string, string> = {};
  const name = cleanName(input.name);
  if (!name) fieldErrors.name = NAME_NEEDED;
  const phone = await checkPhone(actor.companyId, input.phone, null);
  if ("error" in phone) fieldErrors.phone = phone.error;
  const email = await checkEmail(input.email, input.role);
  if ("error" in email) fieldErrors.email = email.error;
  const givePin = input.givePin || Boolean(input.pin);
  if (!givePin && "email" in email && !email.email && !fieldErrors.email) fieldErrors.pin = NO_WAY_IN;
  const checkedScope = await checkSitesInto(fieldErrors, {
    companyId: actor.companyId,
    sites: input.sites,
    role: input.role,
    caller: await siteScopeOf(actor.companyId, actor.userId),
  });
  if (!checkedScope || Object.keys(fieldErrors).length > 0) throw fieldRefusal(fieldErrors);
  const scope = checkedScope;
  const e164 = (phone as { phone: string }).phone;
  const address = (email as { email: string | null }).email;

  const { userId, token, pin } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        companyId: actor.companyId,
        name: name!,
        phone: e164,
        email: address,
        role: userRoleOf(input.role),
        isActive: true,
        allSites: scope.all,
      },
      select: { id: true },
    });
    await writeSites(tx, { companyId: actor.companyId, userId: user.id, scope });
    const inviteToken = await newInvite(tx, {
      companyId: actor.companyId,
      userId: user.id,
      invitedById: actor.userId,
      sentTo: e164,
      now,
    });
    const issued = givePin
      ? await issueTillPin(tx, { companyId: actor.companyId, userId: user.id, issuedById: actor.userId, typed: input.pin, now })
      : null;
    const names = scope.all
      ? ["All sites"]
      : (await tx.site.findMany({ where: { id: { in: scope.ids } }, orderBy: { name: "asc" }, select: { name: true } })).map(
          (site) => site.name,
        );
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.personInvited,
      entityType: "User",
      entityId: user.id,
      payload: { name, role: input.role, sites: names, pin: Boolean(issued), email: Boolean(address) },
    });
    return { userId: user.id, token: inviteToken, pin: issued };
  });
  await clearUserFeatureOverrides(userId);

  const delivery = await sendInvite({ actor, userId, role: input.role, phone: e164, token, pin });
  const data = await loadPerson(actor.companyId, viewerOf(actor), userId, { now });
  return { data: data!, ...delivery };
}

export const INVITE_JOINED = (name: string) => `${name} has joined already.`;
export const NO_ACCESS_FIRST = (name: string) => `${name} has no access. Give access back first.`;

/**
 * "Send the invite again": the old link stops, a new one works for 7 days;
 * a PIN they never used goes again, new, in the same message.
 */
export async function inviteAgain(actor: PeopleActor, id: string, now = new Date()): Promise<InviteResult> {
  const person = await loadPerson(actor.companyId, viewerOf(actor), id, { now });
  if (!person) throw new PeopleRefusal("That person is not in this shop.", 404);
  if (person.state === "NO_ACCESS") throw new PeopleRefusal(NO_ACCESS_FIRST(person.name), 409);
  if (!person.can.edit) throw new PeopleRefusal("Managers change cashiers and stock clerks only.", 403);
  if (person.state !== "INVITED" && person.state !== "INVITE_EXPIRED") {
    throw new PeopleRefusal(INVITE_JOINED(person.name), 409);
  }
  if (!person.phone) throw new PeopleRefusal("Add their phone first.", 409);
  const pinRow = await prisma.retailTillPin.findUnique({ where: { userId: id }, select: { mustChange: true, lastUnlockedAt: true } });
  const pinAgain = Boolean(pinRow?.mustChange && !pinRow.lastUnlockedAt);

  const { token, pin } = await prisma.$transaction(async (tx) => {
    await tx.retailStaffInvite.updateMany({ where: { userId: id, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    const inviteToken = await newInvite(tx, {
      companyId: actor.companyId,
      userId: id,
      invitedById: actor.userId,
      sentTo: person.phone!,
      now,
    });
    const issued = pinAgain ? await issueTillPin(tx, { companyId: actor.companyId, userId: id, issuedById: actor.userId, now }) : null;
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.personInvited,
      entityType: "User",
      entityId: id,
      payload: {
        name: person.name,
        role: person.role,
        sites: person.sites.all ? ["All sites"] : person.sites.names,
        pin: Boolean(issued),
        email: Boolean(person.email),
        again: true,
      },
    });
    return { token: inviteToken, pin: issued };
  });

  const delivery = await sendInvite({ actor, userId: id, role: person.role, phone: person.phone, token, pin });
  const data = await loadPerson(actor.companyId, viewerOf(actor), id, { now });
  return { data: data!, ...delivery };
}
