import bcrypt from "bcryptjs";

import { checkRateLimit } from "@/lib/auth-core/rate-limit";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";

import { shopName } from "./deliver";
import { hashInviteToken } from "./invite";
import { fieldRefusal, PeopleRefusal } from "./refusal";
import { PERSON_ROLE_LABELS, personRoleOf } from "./roles";

/**
 * Joining by the WhatsApp link (80-admin 5.6, `/join/[token]`): the token is
 * the capability. Who and where, then a password for someone who signs in to
 * the admin, or just "Got it" for someone who only uses a till. An invite is
 * also taken by the person's first till PIN or first sign-in
 * (`acceptPendingInvite`).
 */

export const LINK_GONE = "This link is not valid any more.";
export const PASSWORD_SHORT = "Choose a password of 8 characters or more.";
export const TOO_MANY = "Too many tries. Wait an hour and try again.";

export type JoinView = {
  shop: string;
  name: string;
  roleLabel: string;
  /** "for all sites", "at Harare Main Branch". */
  where: string;
  invitedBy: string;
  email: string | null;
  needsPassword: boolean;
};

async function liveInvite(token: string, now: Date) {
  if (!token || token.length > 200) return null;
  const invite = await prisma.retailStaffInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      id: true,
      companyId: true,
      userId: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      invitedBy: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          allSites: true,
          siteAccess: { select: { site: { select: { name: true } } } },
        },
      },
    },
  });
  // Unknown, expired, used or withdrawn are not told apart.
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() <= now.getTime()) return null;
  if (!invite.user.isActive) return null;
  return invite;
}

export async function readJoin(token: string, now = new Date()): Promise<JoinView> {
  const invite = await liveInvite(token, now);
  if (!invite) throw new PeopleRefusal(LINK_GONE, 404);
  const role = personRoleOf(invite.user.role);
  const sites = invite.user.siteAccess.map((access) => access.site.name).sort((a, b) => a.localeCompare(b));
  return {
    shop: await shopName(invite.companyId),
    name: invite.user.name,
    roleLabel: role ? PERSON_ROLE_LABELS[role] : "",
    where: invite.user.allSites ? "for all sites" : `at ${sites.join(", ")}`,
    invitedBy: invite.invitedBy?.name ?? "The shop",
    email: invite.user.email,
    needsPassword: Boolean(invite.user.email),
  };
}

/** Where a person lands once in: the till for a cashier, stock for a stock clerk, else the shop's overview. */
export function homeFor(role: string | null | undefined): string {
  const person = personRoleOf(role);
  if (person === "CASHIER") return "/retail/shifts";
  if (person === "STOCK_CLERK") return "/retail/stock";
  return "/retail";
}

/** `POST /api/public/retail/join/[token]`: a password when they sign in to the admin, then the invite is taken. */
export async function acceptJoin(
  token: string,
  input: { password?: string | null },
  now = new Date(),
): Promise<{ email: string | null; home: string }> {
  const limit = checkRateLimit({ key: `retail-join:${hashInviteToken(token)}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) throw new PeopleRefusal(TOO_MANY, 429);
  const invite = await liveInvite(token, now);
  if (!invite) throw new PeopleRefusal(LINK_GONE, 404);

  const user = invite.user;
  const password = input.password ?? "";
  if (user.email && (password.length < 8 || password.length > 200)) throw fieldRefusal({ password: PASSWORD_SHORT });
  const hash = user.email ? await bcrypt.hash(password, 12) : null;

  await prisma.$transaction(async (tx) => {
    // Taken once: a second click on the same link finds it accepted.
    const taken = await tx.retailStaffInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    if (taken.count !== 1) throw new PeopleRefusal(LINK_GONE, 404);
    if (hash) await tx.user.update({ where: { id: user.id }, data: { password: hash, passwordChangedAt: now } });
    await writeRetailAuditEvent(tx, {
      actor: { companyId: invite.companyId, userId: user.id, userName: user.name, userRole: user.role },
      eventType: RETAIL_AUDIT_EVENTS.personJoined,
      entityType: "User",
      entityId: user.id,
      payload: { how: "link" },
    });
  });
  return { email: user.email, home: homeFor(user.role) };
}

/**
 * A waiting invite is taken by the person's first sign-in or first till PIN:
 * they are in, so the link has done its job. Nothing when none waits.
 */
export async function acceptPendingInvite(userId: string, how: "pin" | "sign-in", now = new Date()): Promise<void> {
  const waiting = await prisma.retailStaffInvite.findFirst({
    where: { userId, acceptedAt: null, revokedAt: null },
    select: { companyId: true, user: { select: { name: true, role: true } } },
  });
  if (!waiting) return;
  await prisma.$transaction(async (tx) => {
    const taken = await tx.retailStaffInvite.updateMany({
      where: { userId, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    if (taken.count === 0) return;
    await writeRetailAuditEvent(tx, {
      actor: { companyId: waiting.companyId, userId, userName: waiting.user.name, userRole: waiting.user.role },
      eventType: RETAIL_AUDIT_EVENTS.personJoined,
      entityType: "User",
      entityId: userId,
      payload: { how },
    });
  });
}
