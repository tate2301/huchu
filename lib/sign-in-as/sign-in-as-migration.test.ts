/**
 * Migration witness for `sign_in_as` and `member_sessions_ended_at`.
 *
 * Signing in as a member is one row with a number, a mode, a reason and an
 * end, which the session it opens is checked against; the support access
 * request and support session pair it replaces is gone. A member's sessions
 * can be ended at a moment.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function columns(table: string) {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES" }]));
}

async function enumLabels(name: string) {
  const [{ labels }] = await prisma.$queryRaw<Array<{ labels: string[] | null }>>`
    SELECT array_agg(enumlabel ORDER BY enumsortorder)::text[] AS labels
    FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = ${name}`;
  return labels;
}

describe("sign in as", () => {
  it("is one session row with a number, a mode, a reason and an end", async () => {
    const cols = await columns("SignInAsSession");
    expect(cols.number).toEqual({ type: "int4", nullable: false });
    expect(cols.mode).toEqual({ type: "SignInAsMode", nullable: false });
    expect(cols.reason).toEqual({ type: "text", nullable: false });
    expect(cols.expiresAt).toEqual({ type: "timestamp", nullable: false });
    expect(cols.endedAt).toEqual({ type: "timestamp", nullable: true });
    expect(cols.endedBy).toEqual({ type: "SignInAsEnd", nullable: true });
    expect(cols.ownerEndTokenHash).toEqual({ type: "text", nullable: false });
    expect(await enumLabels("SignInAsMode")).toEqual(["LOOK", "CHANGE"]);
    expect(await enumLabels("SignInAsEnd")).toEqual(["OPERATOR", "OWNER", "SIGNED_OUT"]);
  });

  it("is named on the ticket that opens it", async () => {
    expect((await columns("SessionHandoff")).signInAsSessionId).toEqual({ type: "text", nullable: true });
  });

  it("replaces the support access request and support session", async () => {
    expect(await columns("SupportAccessRequest")).toEqual({});
    expect(await columns("SupportSession")).toEqual({});
    expect(await enumLabels("SupportAccessStatus")).toBeNull();
  });

  it("can end a member's sessions at a moment", async () => {
    expect((await columns("User")).sessionsEndedAt).toEqual({ type: "timestamp", nullable: true });
  });
});
