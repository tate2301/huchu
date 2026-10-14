import { describe, expect, it } from "vitest";

import { mergeReminder, remindersFinding, type ReminderFamily } from "./fee-reminders";

const family = (studentId: string, owed: number): ReminderFamily => ({
  studentId,
  family: `The ${studentId} family`,
  pupil: `${studentId}, Form 3B`,
  owed,
  goesBy: "Portal",
  reachable: true,
});

describe("fee reminders Vane drafts", () => {
  it("read as each family's own: their name, their child and what they owe", () => {
    const words = "Dear [family], Mazowe High has not yet received third-term fees for [pupil]: [amount]. Thank you.";
    expect(mergeReminder(words, { family: "The Moyo family", firstName: "Rumbidzai", owed: 1420 })).toBe(
      "Dear The Moyo family, Mazowe High has not yet received third-term fees for Rumbidzai: $1,420.00. Thank you.",
    );
    expect(mergeReminder("[Family] owes [AMOUNT]", { family: "The Zhou family", firstName: "Nyasha", owed: 870.5 })).toBe("The Zhou family owes $870.50");
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
