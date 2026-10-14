import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminRefusal } from "@/lib/admin/refusal";
import { consumeSessionHandoff } from "@/lib/auth-core/session-handoff";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import {
  endSignInAs,
  endSignInAsByOwnerLink,
  endSignInAsForMember,
  openSignInAs,
  SIGN_IN_AS_MS,
  signInAsState,
  startSignInAs,
} from "@/lib/sign-in-as/sessions";

const run = randomUUID().slice(0, 8);
const REASON = "WhatsApp from the owner: cannot see deals";
let support: SignedInOperator;
let billing: SignedInOperator;
let workspace: { id: string; name: string };
let memberId: string;
let goneId: string;

beforeAll(async () => {
  const [s, b] = await Promise.all([
    prisma.operator.create({ data: { email: `s-${run}@corelith.test`, name: "Farai Moyo", role: "SUPPORT" } }),
    prisma.operator.create({ data: { email: `b-${run}@corelith.test`, name: "Rumbi Sithole", role: "BILLING" } }),
  ]);
  support = { sessionId: "x", id: s.id, email: s.email, name: s.name, role: s.role };
  billing = { sessionId: "y", id: b.id, email: b.email, name: b.name, role: b.role };
  const company = await prisma.company.create({ data: { name: `Chikuru ${run}`, slug: `sia-${run}`, tenantStatus: "ACTIVE" } });
  workspace = { id: company.id, name: company.name };
  memberId = (await prisma.user.create({ data: { name: "Rutendo", email: `r-${run}@x.test`, role: "SALES_REP", companyId: company.id } })).id;
  goneId = (await prisma.user.create({ data: { name: "Gone", email: `g-${run}@x.test`, role: "CLERK", companyId: company.id, isActive: false } })).id;
});

afterAll(async () => {
  await prisma.signInAsSession.deleteMany({ where: { companyId: workspace.id } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: workspace.id } });
  await prisma.user.deleteMany({ where: { companyId: workspace.id } });
  await prisma.company.delete({ where: { id: workspace.id } });
  await prisma.operator.deleteMany({ where: { id: { in: [support.id, billing.id] } } });
});

describe("signing in as a member", () => {
  it("needs a reason, an active member of this workspace, and a role that may make changes to make them", async () => {
    await expect(startSignInAs({ operator: support, workspace, memberId, mode: "LOOK", reason: "help" })).rejects.toThrow(AdminRefusal);
    await expect(startSignInAs({ operator: support, workspace, memberId: goneId, mode: "LOOK", reason: REASON })).rejects.toThrow(/no access/);
    await expect(startSignInAs({ operator: billing, workspace, memberId, mode: "CHANGE", reason: REASON })).rejects.toThrow(/look only/);
  });

  it("opens a 30-minute session whose one-use ticket names it, and logs the reason on the workspace's chain", async () => {
    const now = new Date();
    const started = await startSignInAs({ operator: billing, workspace, memberId, mode: "LOOK", reason: REASON, now });
    expect(started.session.expiresAt.getTime() - now.getTime()).toBe(SIGN_IN_AS_MS);
    expect(await consumeSessionHandoff(started.handoffToken, now)).toEqual({ userId: memberId, signInAsSessionId: started.session.id });
    expect(await openSignInAs(started.session.id, now)).toMatchObject({ mode: "LOOK", operatorName: "Rumbi Sithole", memberId });
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: workspace.id, eventType: "operator.sign_in_as.started" } });
    expect(event.reason).toBe(REASON);
    expect(signInAsState(started.session, now)).toBe("Open, look only");
    expect(signInAsState(started.session, new Date(now.getTime() + SIGN_IN_AS_MS))).toBe("Timed out");
  });

  it("keeps one open session per operator per workspace", async () => {
    const first = await startSignInAs({ operator: support, workspace, memberId, mode: "LOOK", reason: REASON });
    const second = await startSignInAs({ operator: support, workspace, memberId, mode: "CHANGE", reason: REASON });
    expect(await openSignInAs(first.session.id)).toBeNull();
    expect(await openSignInAs(second.session.id)).not.toBeNull();
  });

  it("ends from the owner's link once, and says so the second time", async () => {
    const started = await startSignInAs({ operator: support, workspace, memberId, mode: "LOOK", reason: REASON });
    expect(await endSignInAsByOwnerLink(started.ownerEndToken)).toMatchObject({ kind: "ended" });
    expect(await openSignInAs(started.session.id)).toBeNull();
    expect(await endSignInAsByOwnerLink(started.ownerEndToken)).toMatchObject({ kind: "already-over" });
    expect(await endSignInAsByOwnerLink("not-a-token")).toEqual({ kind: "unknown" });
    const row = await prisma.signInAsSession.findUniqueOrThrow({ where: { id: started.session.id } });
    expect(signInAsState(row)).toBe("Ended by the owner");
  });

  it("ends when the member is signed out everywhere, and an ended session cannot end again", async () => {
    const started = await startSignInAs({ operator: support, workspace, memberId, mode: "LOOK", reason: REASON });
    await endSignInAsForMember(memberId);
    expect(await openSignInAs(started.session.id)).toBeNull();
    expect(await endSignInAs(started.session.id, "OPERATOR", support.id)).toBeNull();
  });
});
