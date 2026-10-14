import { describe, expect, it } from "vitest";

import { acceptedStep, codeAt, formatSecretForTyping, newAuthenticatorSecret } from "@/lib/operators/totp";

const secret = newAuthenticatorSecret();
const now = Date.parse("2026-10-13T12:20:10Z");

describe("an authenticator code", () => {
  it("is accepted for its own 30 seconds and one step either side, for a phone's drifting clock", () => {
    expect(acceptedStep(secret, codeAt(secret, now), null, now)).not.toBeNull();
    expect(acceptedStep(secret, codeAt(secret, now - 30_000), null, now)).not.toBeNull();
    expect(acceptedStep(secret, codeAt(secret, now - 90_000), null, now)).toBeNull();
  });

  it("is refused once its step has been used", () => {
    const step = acceptedStep(secret, codeAt(secret, now), null, now)!;
    expect(acceptedStep(secret, codeAt(secret, now), step, now)).toBeNull();
  });

  it("takes the code with a space in the middle, and nothing that is not six digits", () => {
    const code = codeAt(secret, now);
    expect(acceptedStep(secret, `${code.slice(0, 3)} ${code.slice(3)}`, null, now)).not.toBeNull();
    expect(acceptedStep(secret, "12345", null, now)).toBeNull();
  });

  it("shows the secret in groups of four for typing", () => {
    expect(formatSecretForTyping("ABCDEFGHIJKL")).toBe("ABCD EFGH IJKL");
  });
});
