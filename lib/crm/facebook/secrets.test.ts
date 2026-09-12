import { describe, expect, it } from "vitest";

import {
  IntegrationSecretError,
  decryptSecret,
  encryptSecret,
  integrationEncryptionAvailable,
  secretTail,
} from "./secrets";

// 32 bytes, base64 — what `openssl rand -base64 32` produces.
const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
const env = { CRM_INTEGRATION_ENCRYPTION_KEY: KEY } as unknown as NodeJS.ProcessEnv;

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a Page access token", () => {
    const token = "EAAG".concat("x".repeat(180));
    expect(decryptSecret(encryptSecret(token, env), env)).toBe(token);
  });

  it("produces a different ciphertext each time, so equal tokens are not visibly equal", () => {
    const a = encryptSecret("same-secret", env);
    const b = encryptSecret("same-secret", env);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, env)).toBe(decryptSecret(b, env));
  });

  it("refuses a value encrypted under a different key rather than returning garbage", () => {
    const payload = encryptSecret("app-secret", env);
    expect(() =>
      decryptSecret(payload, { CRM_INTEGRATION_ENCRYPTION_KEY: OTHER_KEY } as unknown as NodeJS.ProcessEnv),
    ).toThrow(IntegrationSecretError);
  });

  it("refuses a tampered ciphertext — GCM authenticates, it does not just decrypt", () => {
    const payload = encryptSecret("app-secret", env);
    const parts = payload.split(".");
    parts[3] = Buffer.from("tampered-value").toString("base64url");
    expect(() => decryptSecret(parts.join("."), env)).toThrow(IntegrationSecretError);
  });

  it("accepts a 64-character hex key as well as base64", () => {
    const hexEnv = {
      CRM_INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("hex"),
    } as unknown as NodeJS.ProcessEnv;
    expect(decryptSecret(encryptSecret("tok", hexEnv), hexEnv)).toBe("tok");
  });

  it("says which variable is missing rather than failing obscurely", () => {
    const bare = {} as unknown as NodeJS.ProcessEnv;
    expect(() => encryptSecret("tok", bare)).toThrow(/CRM_INTEGRATION_ENCRYPTION_KEY/);
    expect(integrationEncryptionAvailable(bare)).toBe(false);
    expect(integrationEncryptionAvailable(env)).toBe(true);
  });

  it("rejects a key that is the wrong length", () => {
    const short = {
      CRM_INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64"),
    } as unknown as NodeJS.ProcessEnv;
    expect(() => encryptSecret("tok", short)).toThrow(/32 bytes/);
  });
});

describe("secretTail", () => {
  it("is the last four characters, for a screen that must not show the token", () => {
    expect(secretTail("EAAGabcd1234")).toBe("1234");
  });
});
