import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminRefusal } from "@/lib/admin/refusal";
import type { SignedInOperator } from "@/lib/operators/guards";
import {
  acceptInvite,
  changeOperatorRole,
  findInvite,
  inviteOperator,
  listOperators,
  removeOperator,
  resetAuthenticator,
  sendNewInvite,
} from "@/lib/operators/manage";
import { findSession } from "@/lib/operators/session";
import { prisma } from "@/lib/prisma";

const run = randomUUID().slice(0, 8);
let owner: SignedInOperator;
const ids: string[] = [];

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `owner-${run}@corelith.test`, name: "Tafadzwa", role: "OWNER", passwordHash: "x" } });
  owner = { sessionId: "s", id: op.id, email: op.email, name: op.name, role: op.role };
  ids.push(op.id);
});

afterAll(async () => {
  await prisma.operator.deleteMany({ where: { OR: [{ id: { in: ids } }, { email: { contains: run } }] } });
});

describe("keeping operators", () => {
  it("invites by email, once per address, and the invite sets a password then asks for an authenticator", async () => {
    const { operator, token } = await inviteOperator(owner, { name: "Nyasha", email: `Nyasha-${run}@corelith.test`, role: "SUPPORT" });
    ids.push(operator.id);
    expect(operator.email).toBe(`nyasha-${run}@corelith.test`);
    await expect(inviteOperator(owner, { name: "Nyasha", email: `nyasha-${run}@corelith.test`, role: "SUPPORT" })).rejects.toThrow(AdminRefusal);
    expect((await listOperators()).find((row) => row.id === operator.id)?.state).toBe("Invited");

    await expect(acceptInvite(token, "short", {})).rejects.toThrow(/at least 12/);
    const accepted = await acceptInvite(token, "a-long-enough-password", {});
    expect(accepted.next).toBe("set-up");
    expect(await findInvite(token)).toBeNull();
    expect((await listOperators()).find((row) => row.id === operator.id)?.state).toBe("Needs a second factor");
  });

  it("a new invite stops the old password and ends every session", async () => {
    const { operator, token } = await inviteOperator(owner, { name: "Chipo", email: `chipo-${run}@corelith.test`, role: "SUPPORT" });
    ids.push(operator.id);
    const { sessionToken } = await acceptInvite(token, "a-long-enough-password", {});
    await sendNewInvite(owner, operator.id);
    expect(await findSession(sessionToken)).toBeNull();
    expect((await prisma.operator.findUniqueOrThrow({ where: { id: operator.id } })).passwordHash).toBeNull();
  });

  it("resets an authenticator, changes a role, and removes — never their own, never the last owner", async () => {
    const { operator } = await inviteOperator(owner, { name: "Rumbi", email: `rumbi-${run}@corelith.test`, role: "BILLING" });
    ids.push(operator.id);
    await resetAuthenticator(owner, operator.id);
    await changeOperatorRole(owner, operator.id, "OWNER");
    expect((await prisma.operator.findUniqueOrThrow({ where: { id: operator.id } })).role).toBe("OWNER");
    await expect(removeOperator(owner, owner.id)).rejects.toThrow(/another owner/);
    await removeOperator(owner, operator.id);
    expect((await listOperators()).find((row) => row.id === operator.id)?.state).toBe("Removed");
  });
});
