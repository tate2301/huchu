import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { sealSecret } from "@/lib/operators/secret-box";
import { findSession } from "@/lib/operators/session";
import {
  authenticatorToSetUp,
  checkCode,
  checkPassword,
  confirmAuthenticator,
  hashOperatorPassword,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/operators/sign-in";
import { codeAt, newAuthenticatorSecret } from "@/lib/operators/totp";

const PASSWORD = "a-long-test-password";
const SECRET = newAuthenticatorSecret();
const run = randomUUID().slice(0, 8);
const emails: string[] = [];

async function operator(overrides: { authenticator?: boolean } = {}) {
  const email = `op-${run}-${emails.length}@corelith.test`;
  emails.push(email);
  return prisma.operator.create({
    data: {
      email,
      name: "Test Operator",
      role: "SUPPORT",
      passwordHash: await hashOperatorPassword(PASSWORD),
      ...(overrides.authenticator === false ? {} : { totpSecret: sealSecret(SECRET), totpConfirmedAt: new Date() }),
    },
  });
}

beforeAll(() => {
  vi.stubEnv("OPERATOR_SECRET_KEY", Buffer.alloc(32, 7).toString("base64"));
});

afterAll(async () => {
  await prisma.operator.deleteMany({ where: { email: { in: emails } } });
  vi.unstubAllEnvs();
});

describe("signing an operator in", () => {
  it("refuses an unknown email exactly as it refuses a wrong password", async () => {
    const op = await operator();
    expect(await checkPassword({ email: "nobody@corelith.test", password: PASSWORD })).toEqual({ ok: false, reason: "mismatch" });
    expect(await checkPassword({ email: op.email, password: "wrong-password" })).toEqual({ ok: false, reason: "mismatch" });
  });

  it("locks after five wrong answers, and the right password does not open it", async () => {
    const op = await operator();
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i += 1) {
      expect((await checkPassword({ email: op.email, password: "wrong" })).ok).toBe(false);
    }
    const fifth = await checkPassword({ email: op.email, password: "wrong" });
    expect(fifth).toMatchObject({ ok: false, reason: "locked" });
    expect(await checkPassword({ email: op.email, password: PASSWORD })).toMatchObject({ ok: false, reason: "locked" });
  });

  it("needs the code after the password, and a session is only good once the code is in", async () => {
    const op = await operator();
    const result = await checkPassword({ email: op.email.toUpperCase(), password: PASSWORD });
    expect(result).toMatchObject({ ok: true, next: "code" });
    const token = result.ok ? result.token : "";
    expect((await findSession(token))?.verifiedAt).toBeNull();

    expect(await checkCode(token, "000000")).toEqual({ ok: false, reason: "wrong" });
    expect(await checkCode(token, codeAt(SECRET))).toEqual({ ok: true });
    expect((await findSession(token))?.verifiedAt).toBeInstanceOf(Date);
  });

  it("takes each code once", async () => {
    const op = await operator();
    const first = await checkPassword({ email: op.email, password: PASSWORD });
    const code = codeAt(SECRET);
    expect(await checkCode(first.ok ? first.token : "", code)).toEqual({ ok: true });

    const second = await checkPassword({ email: op.email, password: PASSWORD });
    expect(await checkCode(second.ok ? second.token : "", code)).toEqual({ ok: false, reason: "wrong" });
  });

  it("sends an operator with no authenticator to set one up, and keeps the same secret across reloads", async () => {
    const op = await operator({ authenticator: false });
    const result = await checkPassword({ email: op.email, password: PASSWORD });
    expect(result).toMatchObject({ ok: true, next: "set-up" });
    const token = result.ok ? result.token : "";

    const first = await authenticatorToSetUp(token);
    const again = await authenticatorToSetUp(token);
    expect(first?.secret).toBeTruthy();
    expect(again?.secret).toBe(first?.secret);
    expect(first?.uri).toContain("otpauth://totp/");

    // A code cannot sign in before the authenticator is confirmed.
    expect(await checkCode(token, codeAt(first!.secret))).toEqual({ ok: false, reason: "expired" });
    expect(await confirmAuthenticator(token, codeAt(first!.secret))).toEqual({ ok: true });
    expect((await prisma.operator.findUniqueOrThrow({ where: { id: op.id } })).totpConfirmedAt).toBeInstanceOf(Date);
  });

  it("refuses a removed operator", async () => {
    const op = await operator();
    await prisma.operator.update({ where: { id: op.id }, data: { deactivatedAt: new Date() } });
    expect(await checkPassword({ email: op.email, password: PASSWORD })).toEqual({ ok: false, reason: "mismatch" });
  });
});
