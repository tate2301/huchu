import { describe, expect, it } from "vitest";

import { amountOf, remindersFinding, type ReminderFamily } from "./fee-reminders";

const family = (studentId: string, owed: number): ReminderFamily => ({
  studentId,
  family: `The ${studentId} family`,
  pupil: `${studentId}, Form 3B`,
  owed,
  goesBy: "Portal",
  reachable: true,
});

describe("fee reminders Vane drafts", () => {
  it("read the amount Vane wrote for each family as a figure", () => {
    expect(amountOf("USD 1,420.00")).toBe(1420);
    expect(amountOf("$870.50")).toBe(870.5);
    expect(amountOf("—")).toBe(0);
  });

  it("say how many families, what they owe between them, and who Vane left unticked", () => {
    const families = [family("Moyo", 1420), family("Ncube", 1180), family("Zhou", 870)];
    expect(remindersFinding(families, ["Zhou"], "they have a payment plan")).toEqual({
      fact: "3 families have paid nothing this term, $3,470.00 between them.",
      rest: "Vane drafted a reminder for each. 1 is unticked: they have a payment plan.",
    });
    expect(remindersFinding([family("Moyo", 1420)], [], null)).toEqual({
      fact: "1 family has paid nothing this term, $1,420.00 between them.",
      rest: "Vane drafted a reminder for it.",
    });
  });
});
