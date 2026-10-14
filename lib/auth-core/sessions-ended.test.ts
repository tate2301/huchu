import { describe, expect, it } from "vitest";

import { buildInitialTokenClaims, signedInBeforeSessionsEnded } from "@/lib/auth-core/session-claims";

describe("sign out everywhere", () => {
  const ended = new Date("2026-10-14T10:00:00Z");

  it("ends a session signed in before it, and keeps one signed in after", () => {
    expect(signedInBeforeSessionsEnded("2026-10-14T09:59:59Z", ended)).toBe(true);
    expect(signedInBeforeSessionsEnded("2026-10-14T10:00:01Z", ended)).toBe(false);
  });

  it("ends a session that predates the sign-in time, once anyone has ended the member's sessions", () => {
    expect(signedInBeforeSessionsEnded(undefined, ended)).toBe(true);
    expect(signedInBeforeSessionsEnded(undefined, null)).toBe(false);
  });

  it("stamps every new session with when it signed in", () => {
    const claims = buildInitialTokenClaims({ id: "user-1", role: "MANAGER", companyId: "company-1" });
    expect(Date.parse(claims.signedInAt ?? "")).toBeGreaterThan(Date.now() - 5000);
  });
});
