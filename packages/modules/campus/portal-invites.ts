import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { SchoolPortalInviteSubject } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";

/**
 * Portal invitations.
 *
 * S-0.2 made `SchoolStudent.userId` and `SchoolGuardian.userId` the only way a
 * portal answers "who is this". This is how those links get created: the school
 * issues an invite, the recipient sets a password, and claiming binds the
 * account. Nothing infers a link from an email address any more.
 *
 * Only the sha256 hash of the token is stored, matching `lib/crm/api-keys.ts`.
 * The plaintext is returned once, to whoever issued the invite, so it can be
 * put in a message; it is not recoverable afterwards.
 *
 * bcrypt at cost 12 for the password, matching `app/api/users/create`.
 */

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 14;
const PASSWORD_COST = 12;

/** Minimum password length. Deliberately the only rule — length beats classes. */
export const MIN_PORTAL_PASSWORD_LENGTH = 10;

export function generateInviteToken() {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function defaultInviteExpiry(from = new Date()) {
  return new Date(from.getTime() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type IssueInviteInput = {
  companyId: string;
  subject: SchoolPortalInviteSubject;
  subjectId: string;
  sentTo: string;
  createdById?: string | null;
  expiresAt?: Date;
};

export type IssuedInvite = {
  id: string;
  subject: SchoolPortalInviteSubject;
  subjectId: string;
  sentTo: string;
  expiresAt: Date;
  /** Shown once. Not stored, not recoverable. */
  token: string;
};

export class InviteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InviteError";
  }
}

/**
 * Issue an invite, superseding any outstanding one for the same subject.
 *
 * Re-inviting is the normal case — a parent loses the message, a phone number
 * changes — so the previous unclaimed token is revoked rather than left live
 * beside the new one. Two working tokens for one account is two chances to
 * leak it.
 */
export async function issuePortalInvite(input: IssueInviteInput): Promise<IssuedInvite> {
  const sentTo = input.sentTo.trim().toLowerCase();
  if (!sentTo) throw new InviteError("An email address is required", 400);

  const isStudent = input.subject === "STUDENT";

  const exists = isStudent
    ? await prisma.schoolStudent.findFirst({
        where: { id: input.subjectId, companyId: input.companyId },
        select: { id: true, userId: true },
      })
    : await prisma.schoolGuardian.findFirst({
        where: { id: input.subjectId, companyId: input.companyId },
        select: { id: true, userId: true },
      });

  if (!exists) {
    throw new InviteError(
      isStudent ? "Student not found in this school" : "Guardian not found in this school",
      404,
    );
  }
  if (exists.userId) {
    throw new InviteError("This record already has a portal account", 409);
  }

  const { token, tokenHash } = generateInviteToken();
  const expiresAt = input.expiresAt ?? defaultInviteExpiry();

  const invite = await prisma.$transaction(async (tx) => {
    await tx.schoolPortalInvite.updateMany({
      where: {
        companyId: input.companyId,
        ...(isStudent ? { studentId: input.subjectId } : { guardianId: input.subjectId }),
        claimedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return tx.schoolPortalInvite.create({
      data: {
        companyId: input.companyId,
        subject: input.subject,
        studentId: isStudent ? input.subjectId : null,
        guardianId: isStudent ? null : input.subjectId,
        tokenHash,
        sentTo,
        expiresAt,
        createdById: input.createdById ?? null,
      },
      select: { id: true, subject: true, sentTo: true, expiresAt: true },
    });
  });

  return { ...invite, subjectId: input.subjectId, token };
}

export type InviteView = {
  id: string;
  subject: SchoolPortalInviteSubject;
  sentTo: string;
  expiresAt: Date;
  displayName: string;
  reference: string;
};

/**
 * Look an invite up by its token.
 *
 * Signed out — the token is the capability. Returns only what the claim page
 * needs to show who it is for; nothing about the school's other records.
 */
export async function findClaimableInvite(token: string): Promise<InviteView | null> {
  if (!token?.trim()) return null;

  const invite = await prisma.schoolPortalInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      id: true,
      subject: true,
      sentTo: true,
      expiresAt: true,
      claimedAt: true,
      revokedAt: true,
      student: { select: { firstName: true, lastName: true, studentNo: true } },
      guardian: { select: { firstName: true, lastName: true, guardianNo: true } },
    },
  });

  if (!invite) return null;
  if (invite.claimedAt || invite.revokedAt) return null;
  if (invite.expiresAt.getTime() <= Date.now()) return null;

  const person = invite.student ?? invite.guardian;
  if (!person) return null;

  return {
    id: invite.id,
    subject: invite.subject,
    sentTo: invite.sentTo,
    expiresAt: invite.expiresAt,
    displayName: `${person.firstName} ${person.lastName}`,
    reference: invite.student?.studentNo ?? invite.guardian?.guardianNo ?? "",
  };
}

/**
 * Claim an invite: create or reuse the user, set their password, bind the link.
 *
 * The whole thing is one transaction. A half-claimed invite — account created,
 * link not written — would leave someone able to sign in to a portal that
 * resolves to nobody, which is exactly the state S-0.2 removed.
 */
export async function claimPortalInvite(input: {
  token: string;
  password: string;
  name?: string | null;
}) {
  if (input.password.length < MIN_PORTAL_PASSWORD_LENGTH) {
    throw new InviteError(
      `Choose a password of at least ${MIN_PORTAL_PASSWORD_LENGTH} characters`,
      400,
    );
  }

  const tokenHash = hashInviteToken(input.token);
  const passwordHash = await bcrypt.hash(input.password, PASSWORD_COST);

  return prisma.$transaction(async (tx) => {
    const invite = await tx.schoolPortalInvite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        companyId: true,
        subject: true,
        studentId: true,
        guardianId: true,
        sentTo: true,
        expiresAt: true,
        claimedAt: true,
        revokedAt: true,
        student: { select: { firstName: true, lastName: true, userId: true } },
        guardian: { select: { firstName: true, lastName: true, userId: true } },
      },
    });

    if (!invite) throw new InviteError("This invitation link is not valid", 404);
    if (invite.claimedAt) throw new InviteError("This invitation has already been used", 409);
    if (invite.revokedAt) throw new InviteError("This invitation was withdrawn", 409);
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new InviteError("This invitation has expired. Ask the school for a new one", 410);
    }

    const subjectRecord = invite.student ?? invite.guardian;
    if (!subjectRecord) throw new InviteError("This invitation link is not valid", 404);
    if (subjectRecord.userId) {
      throw new InviteError("This record already has a portal account", 409);
    }

    const isStudent = invite.subject === "STUDENT";
    const role = isStudent ? "STUDENT" : "PARENT";
    const name =
      input.name?.trim() || `${subjectRecord.firstName} ${subjectRecord.lastName}`;

    const existing = await tx.user.findUnique({
      where: { email: invite.sentTo },
      select: { id: true, companyId: true },
    });

    // A guardian with children at two schools would need two accounts under
    // this shape; refusing is honest, where silently rebinding the account to a
    // new tenant would move them out of the first school without warning.
    if (existing && existing.companyId !== invite.companyId) {
      throw new InviteError(
        "This email already has an account with another organisation",
        409,
      );
    }

    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { password: passwordHash, name, role },
          select: { id: true, email: true, name: true, role: true },
        })
      : await tx.user.create({
          data: {
            companyId: invite.companyId,
            email: invite.sentTo,
            name,
            password: passwordHash,
            role,
          },
          select: { id: true, email: true, name: true, role: true },
        });

    if (isStudent) {
      await tx.schoolStudent.update({
        where: { id: invite.studentId! },
        data: { userId: user.id },
      });
    } else {
      await tx.schoolGuardian.update({
        where: { id: invite.guardianId! },
        data: { userId: user.id },
      });
    }

    await tx.schoolPortalInvite.update({
      where: { id: invite.id },
      data: { claimedAt: new Date(), claimedUserId: user.id },
    });

    return { user, subject: invite.subject };
  });
}

export async function revokePortalInvite(input: { companyId: string; inviteId: string }) {
  const result = await prisma.schoolPortalInvite.updateMany({
    where: {
      id: input.inviteId,
      companyId: input.companyId,
      claimedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}
