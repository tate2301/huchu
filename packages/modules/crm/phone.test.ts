import { describe, expect, it } from "vitest";

import { normalizeEmail, normalizePhoneE164 } from "./phone";

describe("normalizePhoneE164", () => {
  it("keeps a well-formed +prefixed number, stripping separators", () => {
    expect(normalizePhoneE164("+263 77 123 4567")).toBe("+263771234567");
    expect(normalizePhoneE164("+1 (415) 555-2671")).toBe("+14155552671");
  });

  it("applies a default dial code to national input and drops the trunk zero", () => {
    expect(normalizePhoneE164("0771234567", "263")).toBe("+263771234567");
    expect(normalizePhoneE164("771234567", "263")).toBe("+263771234567");
    expect(normalizePhoneE164("077 123 4567", "+263")).toBe("+263771234567");
  });

  it("does not double-apply a dial code already present", () => {
    expect(normalizePhoneE164("263771234567", "263")).toBe("+263771234567");
  });

  it("accepts a bare international number without a dial code when long enough", () => {
    expect(normalizePhoneE164("263771234567")).toBe("+263771234567");
  });

  it("rejects ambiguous, empty, or junk input", () => {
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164("abc")).toBeNull();
    expect(normalizePhoneE164("12")).toBeNull(); // too short
    expect(normalizePhoneE164("0123", "0")).toBeNull(); // still starts with 0
  });

  it("rejects numbers longer than E.164 allows", () => {
    expect(normalizePhoneE164("+12345678901234567")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims valid emails", () => {
    expect(normalizeEmail("  John.Doe@Example.COM ")).toBe("john.doe@example.com");
  });

  it("rejects invalid emails", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
