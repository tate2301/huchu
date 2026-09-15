/**
 * Claiming a portal account.
 *
 * The token in the link is the whole of the caller's authority, so the claim is
 * the one place where an unauthenticated request writes a password. What it must
 * never write it to is an account that already exists: the office types the
 * address on the invite, and an address that is already a teacher's login would
 * otherwise hand that login's password, and its role, to whoever opened the
 * link.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { findClaimableInvite, issuePortalInvite } from "@/lib/schools/portal-invites";
import { POST } from "./route";

let companyId: string;
let guardianId: string;
let stamp: number;

function claimEmail(label: string) {
  return `${label}-${stamp}@claim.test`;
}

async function claim(token: string, password: string) {
  const response = await POST(
    new NextRequest(`http://school.test/api/public/schools/claim/${token}`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
    { params: Promise.resolve({ token }) },
  );
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Claim School ${stamp}`, slug: `claim-school-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.schoolPortalInvite.deleteMany({ where: { companyId } });
  await prisma.schoolGuardian.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });

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

describe("an address nobody holds", () => {
  it("opens the account and sends the parent to their own sign-in", async () => {
    const invite = await issuePortalInvite({
      companyId,
      subject: "GUARDIAN",
      subjectId: guardianId,
      sentTo: claimEmail("rudo"),
    });

    const { status, body } = await claim(invite.token, "a long enough password");

    expect(status).toBe(200);
    expect(body.data.email).toBe(claimEmail("rudo"));
    expect(body.data.signInPath).toBe("/portal/parent/login");

    const guardian = await prisma.schoolGuardian.findUnique({
      where: { id: guardianId },
      select: { userId: true },
    });
    expect(guardian?.userId).not.toBeNull();
  });
});

describe("an address that is already an account", () => {
  it("refuses, and leaves that account exactly as it was", async () => {
    const email = claimEmail("teacher");
    const before = await prisma.user.create({
      data: {
        companyId,
        email,
        name: "Mr Chikafu",
        password: await bcrypt.hash("the teacher's own password", 10),
        role: "TEACHER",
      },
      select: { id: true, password: true, role: true, name: true },
    });

    const invite = await issuePortalInvite({
      companyId,
      subject: "GUARDIAN",
      subjectId: guardianId,
      sentTo: email,
    });

    const { status } = await claim(invite.token, "a long enough password");
    expect(status).toBe(409);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: before.id },
      select: { password: true, role: true, name: true },
    });
    // The password, the name and the role: everything the claim would have
    // written over.
    expect(after).toEqual({
      password: before.password,
      role: before.role,
      name: before.name,
    });

    const guardian = await prisma.schoolGuardian.findUnique({
      where: { id: guardianId },
      select: { userId: true },
    });
    expect(guardian?.userId).toBeNull();
  });

  it("does not spend the invite, so the office can re-issue it to a new address", async () => {
    const email = claimEmail("bursar");
    await prisma.user.create({
      data: { companyId, email, name: "Bursar", role: "BURSAR" },
    });

    const invite = await issuePortalInvite({
      companyId,
      subject: "GUARDIAN",
      subjectId: guardianId,
      sentTo: email,
    });

    await claim(invite.token, "a long enough password");

    expect(await findClaimableInvite(invite.token)).not.toBeNull();
  });
});
