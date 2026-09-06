/**
 * Portal invitations.
 *
 * The invite is the only way a `userId` link gets written, so its failure modes
 * are access-control failures: a replayed token is a second account on one
 * record, an expired token is an account the school thought it had withdrawn,
 * and a token that survives revocation is one the school cannot take back.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@corelithzw/db/client";
import {
  InviteError,
  claimPortalInvite,
  defaultInviteExpiry,
  findClaimableInvite,
  hashInviteToken,
  issuePortalInvite,
  revokePortalInvite,
} from "./portal-invites";

let companyId: string;
let otherCompanyId: string;
let studentId: string;
let guardianId: string;
let staffUserId: string;
let stamp: number;

function inviteEmail(label: string) {
  return `${label}-${stamp}@invite.test`;
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Invite School ${stamp}`, slug: `invite-school-${stamp}` },
  });
  companyId = company.id;

  const other = await prisma.company.create({
    data: { name: `Other Invite School ${stamp}`, slug: `other-invite-${stamp}` },
  });
  otherCompanyId = other.id;

  const staff = await prisma.user.create({
    data: {
      companyId,
      email: inviteEmail("registrar"),
      name: "Registrar",
      role: "REGISTRAR",
    },
    select: { id: true },
  });
  staffUserId = staff.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.company.delete({ where: { id: otherCompanyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.schoolPortalInvite.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });
  await prisma.schoolGuardian.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({
    where: { companyId, id: { not: staffUserId } },
  });

  const student = await prisma.schoolStudent.create({
    data: { companyId, studentNo: "STU0001", firstName: "Tendai", lastName: "Moyo" },
    select: { id: true },
  });
  studentId = student.id;

  const guardian = await prisma.schoolGuardian.create({
    data: {
      companyId,
      guardianNo: "GRD0001",
      firstName: "Rudo",
      lastName: "Moyo",
      phone: "+263771000001",
    },
    select: { id: true },
  });
  guardianId = guardian.id;
});

describe("issuing", () => {
  it("returns the token once and stores only its hash", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "GUARDIAN",
      subjectId: guardianId,
      sentTo: inviteEmail("rudo"),
      createdById: staffUserId,
    });

    expect(invite.token).toBeTruthy();

    const stored = await prisma.schoolPortalInvite.findUnique({
      where: { id: invite.id },
      select: { tokenHash: true },
    });
    expect(stored?.tokenHash).toBe(hashInviteToken(invite.token));
    expect(stored?.tokenHash).not.toBe(invite.token);
  });

  it("revokes the previous outstanding invite when reissuing", async () => {
    const first = await issuePortalInvite({
      companyId,
      subject: "GUARDIAN",
      subjectId: guardianId,
      sentTo: inviteEmail("rudo"),
    });
    const second = await issuePortalInvite({
      companyId,
      subject: "GUARDIAN",
      subjectId: guardianId,
      sentTo: inviteEmail("rudo"),
    });

    expect(await findClaimableInvite(first.token)).toBeNull();
    expect(await findClaimableInvite(second.token)).not.toBeNull();
  });

  it("refuses to invite a record that already has an account", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
    });
    await claimPortalInvite({ token: invite.token, password: "correct horse b" });

    await expect(
      issuePortalInvite({
        companyId,
        subject: "STUDENT",
        subjectId: studentId,
        sentTo: inviteEmail("tendai2"),
      }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("refuses a subject from another school", async () => {
    const foreign = await prisma.schoolStudent.create({
      data: {
        companyId: otherCompanyId,
        studentNo: "STU9999",
        firstName: "Not",
        lastName: "Ours",
      },
      select: { id: true },
    });

    await expect(
      issuePortalInvite({
        companyId,
        subject: "STUDENT",
        subjectId: foreign.id,
        sentTo: inviteEmail("foreign"),
      }),
    ).rejects.toBeInstanceOf(InviteError);
  });
});

describe("looking up a token", () => {
  it("finds an outstanding invite and names who it is for", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
    });

    const found = await findClaimableInvite(invite.token);
    expect(found?.displayName).toBe("Tendai Moyo");
    expect(found?.reference).toBe("STU0001");
  });

  it("returns nothing for an unknown, empty or expired token", async () => {
    expect(await findClaimableInvite("not-a-real-token")).toBeNull();
    expect(await findClaimableInvite("")).toBeNull();

    const expired = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await findClaimableInvite(expired.token)).toBeNull();
  });

  it("returns nothing once the invite is withdrawn", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
    });

    expect(await revokePortalInvite({ companyId, inviteId: invite.id })).toBe(true);
    expect(await findClaimableInvite(invite.token)).toBeNull();
  });

  it("does not let another school withdraw an invitation", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
    });

    expect(
      await revokePortalInvite({ companyId: otherCompanyId, inviteId: invite.id }),
    ).toBe(false);
    expect(await findClaimableInvite(invite.token)).not.toBeNull();
  });
});

describe("claiming", () => {
  it("creates the account, hashes the password and binds the link", async () => {
    const email = inviteEmail("tendai");
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: email,
    });

    const result = await claimPortalInvite({
      token: invite.token,
      password: "a long enough password",
    });

    expect(result.user.email).toBe(email);
    expect(result.user.role).toBe("STUDENT");

    const student = await prisma.schoolStudent.findUnique({
      where: { id: studentId },
      select: { userId: true },
    });
    expect(student?.userId).toBe(result.user.id);

    const user = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: { password: true },
    });
    expect(user?.password).not.toBe("a long enough password");
    expect(await bcrypt.compare("a long enough password", user!.password!)).toBe(true);
  });

  it("gives a guardian the PARENT role", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "GUARDIAN",
      subjectId: guardianId,
      sentTo: inviteEmail("rudo"),
    });

    const result = await claimPortalInvite({
      token: invite.token,
      password: "a long enough password",
    });
    expect(result.user.role).toBe("PARENT");

    const guardian = await prisma.schoolGuardian.findUnique({
      where: { id: guardianId },
      select: { userId: true },
    });
    expect(guardian?.userId).toBe(result.user.id);
  });

  it("cannot be replayed", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
    });

    await claimPortalInvite({ token: invite.token, password: "a long enough password" });

    await expect(
      claimPortalInvite({ token: invite.token, password: "another long password" }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("refuses an expired token", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      claimPortalInvite({ token: invite.token, password: "a long enough password" }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("refuses a withdrawn token", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
    });
    await revokePortalInvite({ companyId, inviteId: invite.id });

    await expect(
      claimPortalInvite({ token: invite.token, password: "a long enough password" }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("refuses a short password and writes nothing", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "STUDENT",
      subjectId: studentId,
      sentTo: inviteEmail("tendai"),
    });

    await expect(
      claimPortalInvite({ token: invite.token, password: "short" }),
    ).rejects.toBeInstanceOf(InviteError);

    const student = await prisma.schoolStudent.findUnique({
      where: { id: studentId },
      select: { userId: true },
    });
    expect(student?.userId).toBeNull();
    expect(await findClaimableInvite(invite.token)).not.toBeNull();
  });

  it("refuses an email already belonging to another organisation", async () => {
    const sharedEmail = inviteEmail("shared");
    await prisma.user.create({
      data: {
        companyId: otherCompanyId,
        email: sharedEmail,
        name: "Elsewhere",
        role: "CLERK",
      },
    });

    const invite = await issuePortalInvite({
      companyId,
      subject: "GUARDIAN",
      subjectId: guardianId,
      sentTo: sharedEmail,
    });

    await expect(
      claimPortalInvite({ token: invite.token, password: "a long enough password" }),
    ).rejects.toBeInstanceOf(InviteError);

    const guardian = await prisma.schoolGuardian.findUnique({
      where: { id: guardianId },
      select: { userId: true },
    });
    expect(guardian?.userId).toBeNull();
  });
});

describe("expiry default", () => {
  it("is a fortnight out", () => {
    const from = new Date("2026-08-04T00:00:00.000Z");
    expect(defaultInviteExpiry(from).toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });
});

describe("subject integrity — MIGRATION WITNESS", () => {
  it("refuses a row whose subject does not match the id it carries", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "SchoolPortalInvite"
          ("id", "companyId", "subject", "studentId", "guardianId", "tokenHash", "sentTo", "expiresAt", "updatedAt")
        VALUES
          (gen_random_uuid()::text, ${companyId}, 'STUDENT', NULL, ${guardianId}, ${`bad-${stamp}`}, 'x@y.test', NOW() + INTERVAL '1 day', NOW())
      `,
    ).rejects.toThrow();
  });

  it("refuses a row carrying both a student and a guardian", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "SchoolPortalInvite"
          ("id", "companyId", "subject", "studentId", "guardianId", "tokenHash", "sentTo", "expiresAt", "updatedAt")
        VALUES
          (gen_random_uuid()::text, ${companyId}, 'STUDENT', ${studentId}, ${guardianId}, ${`both-${stamp}`}, 'x@y.test', NOW() + INTERVAL '1 day', NOW())
      `,
    ).rejects.toThrow();
  });
});
