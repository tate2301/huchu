import { formatTicketTime, groupMobileRowsByDate } from "@/lib/scrap-metal/mobile-ticket-date-groups";

describe("groupMobileRowsByDate", () => {
  it("orders rows as Today, Yesterday, then older dates descending", () => {
    const rows = [
      { id: "older-a", date: "2026-04-20T08:00:00.000Z" },
      { id: "today-a", date: "2026-04-24T10:00:00.000Z" },
      { id: "yesterday-a", date: "2026-04-23T09:00:00.000Z" },
      { id: "older-b", date: "2026-04-22T07:00:00.000Z" },
      { id: "today-b", date: "2026-04-24T06:00:00.000Z" },
    ];

    const groups = groupMobileRowsByDate(rows, (row) => row.date, new Date("2026-04-24T12:00:00.000Z"));

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Wednesday, April 22",
      "Monday, April 20",
    ]);
    expect(groups[0]?.items.map((row) => row.id)).toEqual(["today-a", "today-b"]);
    expect(groups[1]?.items.map((row) => row.id)).toEqual(["yesterday-a"]);
  });

  it("formats a readable ticket time", () => {
    expect(formatTicketTime("2026-04-24T10:35:00.000Z")).toMatch(/10|12|35/);
  });
});
