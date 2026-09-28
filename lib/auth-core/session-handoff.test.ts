/**
 * Session handoff tickets, against a real database.
 *
 * A ticket in a URL is a password for two minutes. It must work once, only
 * inside its window, and leave nothing in the table that could be replayed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { SESSION_HANDOFF_TTL_MS, consumeSessionHandoff, createSessionHandoff } from "./session-handoff";

const STAMP = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
const SLUG = `handoff-${STAMP}`;
const T0 = new Date("2026-09-28T08:00:00Z");
let userId = "";

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: "Handoff Test", slug: SLUG } });
  const user = await prisma.user.create({
    data: { companyId: company.id, email: `handoff-${STAMP}@example.test`, name: "Handoff", role: "SUPERADMIN" },
  });
  userId = user.id;
});

afterAll(async () => {
  const company = await prisma.company.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (company) {
    await prisma.user.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
  }
  await prisma.$disconnect();
});

describe("session handoff", () => {
  it("signs in the user it was issued to, once", async () => {
    const token = await createSessionHandoff(userId, T0);
    expect(await consumeSessionHandoff(token, new Date(T0.getTime() + 1_000))).toBe(userId);
    expect(await consumeSessionHandoff(token, new Date(T0.getTime() + 2_000))).toBeNull();
  });

  it("stores the token only as a hash", async () => {
    const token = await createSessionHandoff(userId, T0);
    const rows = await prisma.sessionHandoff.findMany({ where: { userId } });
    expect(rows.some((row) => row.tokenHash.includes(token))).toBe(false);
  });

  it("refuses a ticket after its window", async () => {
    const token = await createSessionHandoff(userId, T0);
    expect(await consumeSessionHandoff(token, new Date(T0.getTime() + SESSION_HANDOFF_TTL_MS))).toBeNull();
  });

  it("refuses a token it never issued, and an empty one", async () => {
    expect(await consumeSessionHandoff("not-a-real-token", T0)).toBeNull();
    expect(await consumeSessionHandoff("", T0)).toBeNull();
  });

  it("lets only one of two simultaneous uses through", async () => {
    const token = await createSessionHandoff(userId, T0);
    const later = new Date(T0.getTime() + 1_000);
    const results = await Promise.all([consumeSessionHandoff(token, later), consumeSessionHandoff(token, later)]);
    expect(results.filter(Boolean)).toEqual([userId]);
  });
});
