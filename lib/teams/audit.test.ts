/**
 * Every member, permission, seat and ownership change writes one line to the
 * workspace's audit chain with who did it, what it was done to, and what it was
 * before and after. One test per kind of change, and a guard that every kind
 * is written by something.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { recordTeamsChange, TEAMS_CHANGES, type TeamsChange, type TeamsEntity } from "./audit";
import { createMember } from "./members";

const run = crypto.randomUUID().slice(0, 8);
let companyId: string;
let actorId: string;

const ENTITY: Record<string, TeamsEntity> = {
  member: "membership",
  permission: "permission",
  seats: "seats",
  invite: "invite",
  invite_link: "invite_link",
  ownership: "ownership_offer",
  record_team: "record_team",
  record_access: "record_access",
};
const entityOf = (change: TeamsChange): TeamsEntity => ENTITY[change.split(".")[0]];

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Audit ${run}`, slug: `audit-${run}` }, select: { id: true } })).id;
  actorId = (await createMember(prisma, { data: { companyId, name: "Sean", email: `sean-${run}@audit.test`, role: "SUPERADMIN" }, select: { id: true } })).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("one line per kind of change", () => {
  it.each(TEAMS_CHANGES.map((change) => [change]))("%s", async (change) => {
    const entityId = crypto.randomUUID();
    await recordTeamsChange(prisma, {
      companyId,
      actorId,
      change,
      entityType: entityOf(change),
      entityId,
      before: { state: "before" },
      after: { state: "after" },
      reason: "witness",
    });
    const [event] = await prisma.platformAuditEvent.findMany({ where: { companyId, entityId } });
    expect(event).toMatchObject({ eventType: `teams.${change}`, entityType: entityOf(change), actor: actorId });
    expect(JSON.parse(event.payloadJson!)).toEqual({ before: { state: "before" }, after: { state: "after" } });
    expect(event.reason).toBe("witness");
  });

  it("keeps the chain unbroken across them", async () => {
    const events = await prisma.platformAuditEvent.findMany({ where: { companyId } });
    expect(events.length).toBeGreaterThanOrEqual(TEAMS_CHANGES.length);
    const hashes = new Set(events.map((event) => event.eventHash));
    expect(hashes.size).toBe(events.length);
    // Every line but the first points at one that is there.
    expect(events.filter((event) => event.prevEventHash === null || !hashes.has(event.prevEventHash))).toHaveLength(1);
  });

  it("is written when a member is created, by whoever added them", async () => {
    const made = await createMember(prisma, {
      actorId,
      reason: "invite",
      data: { companyId, name: "Tariro", email: `tariro-${run}@audit.test`, role: "SALES_REP" },
      select: { id: true, memberships: { select: { id: true } } },
    });
    const [event] = await prisma.platformAuditEvent.findMany({ where: { companyId, entityId: made.memberships[0].id } });
    expect(event).toMatchObject({ eventType: "teams.member.added", actor: actorId, reason: "invite" });
    expect(JSON.parse(event.payloadJson!)).toEqual({ before: null, after: { status: "ACTIVE", role: "SALES_REP", isAdmin: false, isOwner: false } });
  });

  it("lets the system be the actor", async () => {
    const entityId = crypto.randomUUID();
    await recordTeamsChange(prisma, { companyId, actorId: null, change: "invite.expired", entityType: "invite", entityId });
    const [event] = await prisma.platformAuditEvent.findMany({ where: { companyId, entityId } });
    expect(event.actor).toBeNull();
  });
});

describe("every kind of change is written by something", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && entry.name !== "audit.ts" ? [readFileSync(full, "utf8")] : [];
    });
  }

  it.each(TEAMS_CHANGES.map((change) => [change]))("%s has a writer", (change) => {
    const text = [...sources(path.join(process.cwd(), "lib/teams")), readFileSync(path.join(process.cwd(), "lib/platform/change-permission.ts"), "utf8")].join("\n");
    const written = new RegExp(`change:[^\\n]*"${change.replace(".", "\\.")}"`).test(text);
    // members.ts picks between two changes on one line.
    const picked = text.includes(`"${change}"`);
    expect(written || picked).toBe(true);
  });
});
