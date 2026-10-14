import { describe, expect, it } from "vitest";

import { readStanding } from "@/lib/admin/standing";

const now = new Date("2026-10-13T12:20:00Z");
const day = 24 * 60 * 60 * 1000;
const sub = (overrides: Partial<NonNullable<Parameters<typeof readStanding>[0]["subscription"]>>) => ({
  status: "ACTIVE",
  trialEndsAt: null,
  currentPeriodEnd: new Date(now.getTime() + 18 * day),
  graceDays: 7,
  ...overrides,
});

describe("a workspace's standing", () => {
  it("is decided by the tenant status before any subscription", () => {
    expect(readStanding({ tenantStatus: "PROVISIONING", subscription: sub({}) }, now).standing).toBe("Setting up");
    expect(readStanding({ tenantStatus: "SUSPENDED", subscription: sub({}) }, now).standing).toBe("Suspended");
    expect(readStanding({ tenantStatus: "DISABLED", subscription: sub({}) }, now).standing).toBe("Closed");
  });

  it("is a trial until the trial ends, with the days left", () => {
    const reading = readStanding(
      { tenantStatus: "ACTIVE", subscription: sub({ status: "TRIALING", currentPeriodEnd: null, trialEndsAt: new Date(now.getTime() + 4 * day) }) },
      now,
    );
    expect(reading).toMatchObject({ standing: "Trial", days: 4 });
  });

  it("is past due inside the grace days, and read-only after them", () => {
    const lapsed = (daysAgo: number) =>
      readStanding({ tenantStatus: "ACTIVE", subscription: sub({ currentPeriodEnd: new Date(now.getTime() - daysAgo * day) }) }, now);
    expect(lapsed(3).standing).toBe("Past due");
    expect(lapsed(3).until).toEqual(new Date(now.getTime() + 4 * day));
    expect(lapsed(9).standing).toBe("Read-only");
  });

  it("is read-only with no subscription at all, as the tenant app blocks it", () => {
    expect(readStanding({ tenantStatus: "ACTIVE", subscription: null }, now).standing).toBe("Read-only");
  });

  it("is read-only once the subscription is cancelled or expired", () => {
    expect(readStanding({ tenantStatus: "ACTIVE", subscription: sub({ status: "CANCELED" }) }, now).standing).toBe("Read-only");
  });

  it("is past due when the gateway says so, before the date has passed", () => {
    expect(readStanding({ tenantStatus: "ACTIVE", subscription: sub({ status: "PAST_DUE" }) }, now).standing).toBe("Past due");
  });

  it("is active otherwise", () => {
    expect(readStanding({ tenantStatus: "ACTIVE", subscription: sub({}) }, now)).toMatchObject({ standing: "Active", days: 18 });
  });
});
