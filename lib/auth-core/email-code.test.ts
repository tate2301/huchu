/**
 * Email codes, against a real database.
 *
 * The properties that matter are the ones an attacker or a flaky connection
 * would test: a code works once, a wrong guess costs something, an old code
 * dies when a new one is sent, and nobody can make the server send an inbox a
 * code every second.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  EMAIL_CODE_HOURLY_LIMIT,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_AFTER_MS,
  EMAIL_CODE_TTL_MS,
  issueEmailCode,
  verifyEmailCode,
} from "./email-code";

const STAMP = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
const EMAIL = `code-${STAMP}@example.test`;
const T0 = new Date("2026-09-28T08:00:00Z");

function at(ms: number) {
  return new Date(T0.getTime() + ms);
}

async function clear() {
  await prisma.emailCode.deleteMany({ where: { email: EMAIL } });
}

beforeEach(clear);
afterAll(async () => {
  await clear();
  await prisma.$disconnect();
});

async function issue(now = T0) {
  const result = await issueEmailCode({ email: EMAIL, purpose: "SIGNUP" }, now);
  if (!result.ok) throw new Error(`expected a code, got ${result.reason}`);
  return result.code;
}

describe("issueEmailCode", () => {
  it("issues six digits and stores only a hash of them", async () => {
    const code = await issue();
    expect(code).toMatch(/^\d{6}$/);
    const rows = await prisma.emailCode.findMany({ where: { email: EMAIL } });
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).not.toContain(code);
    expect(rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalises the address, so the code reaches the same row however it was typed", async () => {
    const result = await issueEmailCode({ email: `  ${EMAIL.toUpperCase()} `, purpose: "SIGNUP" }, T0);
    expect(result.ok).toBe(true);
    expect(await prisma.emailCode.count({ where: { email: EMAIL } })).toBe(1);
  });

  it("refuses a second code within the resend window, and says when to try", async () => {
    await issue();
    const again = await issueEmailCode({ email: EMAIL, purpose: "SIGNUP" }, at(10_000));
    expect(again).toEqual({ ok: false, reason: "TOO_SOON", retryAfterSeconds: 20 });
  });

  it("stops at the hourly limit however patiently the codes are asked for", async () => {
    for (let i = 0; i < EMAIL_CODE_HOURLY_LIMIT; i += 1) {
      await issue(at(i * EMAIL_CODE_RESEND_AFTER_MS));
    }
    const over = await issueEmailCode(
      { email: EMAIL, purpose: "SIGNUP" },
      at(EMAIL_CODE_HOURLY_LIMIT * EMAIL_CODE_RESEND_AFTER_MS),
    );
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("TOO_MANY");
  });

  it("keeps the two purposes apart", async () => {
    await issue();
    const signIn = await issueEmailCode({ email: EMAIL, purpose: "SIGN_IN" }, at(1_000));
    expect(signIn.ok).toBe(true);
  });
});

describe("verifyEmailCode", () => {
  it("accepts the right code once, then never again", async () => {
    const code = await issue();
    expect(await verifyEmailCode({ email: EMAIL, purpose: "SIGNUP", code }, at(1_000))).toEqual({ ok: true });
    expect(await verifyEmailCode({ email: EMAIL, purpose: "SIGNUP", code }, at(2_000))).toEqual({
      ok: false,
      reason: "MISSING",
    });
  });

  it("does not accept a signup code as a sign-in code", async () => {
    const code = await issue();
    expect(await verifyEmailCode({ email: EMAIL, purpose: "SIGN_IN", code }, at(1_000))).toEqual({
      ok: false,
      reason: "MISSING",
    });
  });

  it("retires the old code when a new one is sent", async () => {
    const first = await issue();
    const second = await issue(at(EMAIL_CODE_RESEND_AFTER_MS));
    if (first !== second) {
      expect(
        await verifyEmailCode({ email: EMAIL, purpose: "SIGNUP", code: first }, at(EMAIL_CODE_RESEND_AFTER_MS + 1)),
      ).toEqual({ ok: false, reason: "INVALID" });
    }
    expect(
      await verifyEmailCode({ email: EMAIL, purpose: "SIGNUP", code: second }, at(EMAIL_CODE_RESEND_AFTER_MS + 2)),
    ).toEqual({ ok: true });
  });

  it("refuses an expired code", async () => {
    const code = await issue();
    expect(await verifyEmailCode({ email: EMAIL, purpose: "SIGNUP", code }, at(EMAIL_CODE_TTL_MS))).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
  });

  it("locks the code after the last wrong guess, and the right code no longer works", async () => {
    const code = await issue();
    const wrong = code === "000000" ? "111111" : "000000";
    const results = [];
    for (let i = 0; i < EMAIL_CODE_MAX_ATTEMPTS; i += 1) {
      results.push(await verifyEmailCode({ email: EMAIL, purpose: "SIGNUP", code: wrong }, at(1_000 + i)));
    }
    expect(results.slice(0, -1).every((r) => !r.ok && r.reason === "INVALID")).toBe(true);
    expect(results.at(-1)).toEqual({ ok: false, reason: "LOCKED" });
    expect(await verifyEmailCode({ email: EMAIL, purpose: "SIGNUP", code }, at(2_000))).toEqual({
      ok: false,
      reason: "LOCKED",
    });
  });

  it("counts a malformed code as a wrong guess rather than letting it through free", async () => {
    await issue();
    expect(await verifyEmailCode({ email: EMAIL, purpose: "SIGNUP", code: "12ab" }, at(1_000))).toEqual({
      ok: false,
      reason: "INVALID",
    });
    const row = await prisma.emailCode.findFirst({ where: { email: EMAIL } });
    expect(row?.attempts).toBe(1);
  });
});
