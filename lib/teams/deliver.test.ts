import { describe, expect, it } from "vitest";

import { joinCode, joinCodeMatches, joinUrl } from "./deliver";

describe("the join code", () => {
  const now = new Date("2026-10-19T09:41:00Z");

  it("is six digits and the same for the same invite within ten minutes", () => {
    const code = joinCode("token-a", now);
    expect(code).toMatch(/^\d{6}$/);
    expect(joinCode("token-a", new Date(now.getTime() + 60_000))).toBe(code);
  });

  it("differs between invites", () => {
    expect(joinCode("token-a", now)).not.toBe(joinCode("token-b", now));
  });

  it("is right for this ten minutes and the one before, then stops", () => {
    const code = joinCode("token-a", now);
    expect(joinCodeMatches("token-a", code, now)).toBe(true);
    expect(joinCodeMatches("token-a", code, new Date(now.getTime() + 10 * 60_000))).toBe(true);
    expect(joinCodeMatches("token-a", code, new Date(now.getTime() + 25 * 60_000))).toBe(false);
    expect(joinCodeMatches("token-a", "000000x", now)).toBe(joinCode("token-a", now) === "000000");
  });

  it("builds the address from the host", () => {
    expect(joinUrl("https://corelith.apps.pagka.local:3000/", "a b")).toBe("https://corelith.apps.pagka.local:3000/join/a%20b");
  });
});
