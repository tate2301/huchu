import { describe, expect, it } from "vitest";

import { listWaiting, type WaitingProvider } from "./waiting";
import { countDifferencesWords, waitedWords } from "./words";

/** "Waiting now" (80-admin 4.2): providers the caller may run, oldest first, five at most. */

const now = new Date("2026-10-03T14:00:00+02:00");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

const requisitions: WaitingProvider = {
  kind: "requisition",
  requires: ["retail.requisitions", "approve"],
  list: async () => [
    { key: "req-14", ref: "REQ-0014", text: ", US$1,940.00, for Afdis.", href: "/retail/buying/requisitions/14", since: hoursAgo(3) },
  ],
};
const counts: WaitingProvider = {
  kind: "count",
  requires: ["retail.counts", "approve"],
  list: async () => [
    { key: "cnt-20", ref: "CNT-0020", text: ", −US$65.50 count difference.", href: "/retail/stock/counts/20/review", since: hoursAgo(1) },
  ],
};
const many: WaitingProvider = {
  kind: "account",
  requires: ["retail.accounts", "approve"],
  list: async () =>
    Array.from({ length: 7 }, (_, index) => ({
      key: `acc-${index}`,
      ref: `Account ${index}`,
      text: ", a US$500.00 limit.",
      href: `/retail/customers/${index}`,
      since: hoursAgo(10 + index),
    })),
};

const as = (role: string) => ({ companyId: "c", userId: "u", session: { user: { role } }, now });

describe("listWaiting", () => {
  it("words each item with its age, oldest first", async () => {
    const answer = await listWaiting(as("SUPERADMIN"), [counts, requisitions]);
    expect(answer).toEqual({
      items: [
        {
          key: "req-14",
          kind: "requisition",
          ref: "REQ-0014",
          text: "REQ-0014, US$1,940.00, for Afdis. 3 hours.",
          href: "/retail/buying/requisitions/14",
          since: hoursAgo(3).toISOString(),
        },
        {
          key: "cnt-20",
          kind: "count",
          ref: "CNT-0020",
          text: "CNT-0020, −US$65.50 count difference. 1 hour.",
          href: "/retail/stock/counts/20/review",
          since: hoursAgo(1).toISOString(),
        },
      ],
      more: 0,
    });
  });

  it("runs only the providers the caller may approve for", async () => {
    const answer = await listWaiting(as("FINANCE_OFFICER"), [counts, requisitions]);
    expect(answer.items.map((item) => item.kind)).not.toContain("count");
  });

  it("shows five and counts the rest", async () => {
    const answer = await listWaiting(as("SUPERADMIN"), [many, requisitions]);
    expect(answer.items).toHaveLength(5);
    expect(answer.more).toBe(3);
    expect(answer.items[0]!.key).toBe("acc-6");
  });

  it("says nothing is waiting with no providers", async () => {
    expect(await listWaiting(as("SUPERADMIN"), [])).toEqual({ items: [], more: 0 });
  });
});

describe("words", () => {
  it("ages in minutes, hours and days", () => {
    expect(waitedWords(new Date(now.getTime() - 20 * 60_000), now)).toBe("20 minutes");
    expect(waitedWords(new Date(now.getTime() - 30_000), now)).toBe("1 minute");
    expect(waitedWords(hoursAgo(1.5), now)).toBe("1 hour");
    expect(waitedWords(hoursAgo(5), now)).toBe("5 hours");
    expect(waitedWords(hoursAgo(26), now)).toBe("1 day");
    expect(waitedWords(hoursAgo(80), now)).toBe("3 days");
  });

  it("names the count segment from the stored amount", () => {
    expect(countDifferencesWords("100.00")).toEqual({
      ANY_MANAGER: "Any manager",
      OWNER_OVER_LIMIT: "Owner approves over US$100",
    });
    expect(countDifferencesWords("62.50").OWNER_OVER_LIMIT).toBe("Owner approves over US$62.50");
  });
});
