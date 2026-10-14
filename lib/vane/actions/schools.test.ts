/** Fee reminders drafted by Vane: each family's own words, and what the approval says it will do. */
import { describe, expect, it } from "vitest";

import { VANE_ACTIONS } from "./registry";
import { reminderFor } from "./schools";

const remind = VANE_ACTIONS.find((action) => action.kind === "schools.fees.remind")!;
const params = remind.params.parse({
  term: "Third term",
  subject: "Third-term fees",
  body: "Dear [family], Mazowe High has not yet received third-term fees for [pupil]: [amount].",
  families: [
    { studentId: "s1", family: "The Moyo family", pupil: "Rumbidzai, Form 3B", amount: "USD 1,420.00" },
    { studentId: "s2", family: "The Ncube family", pupil: "Tafadzwa, Form 4A", amount: "USD 1,180.00" },
  ],
  leftOut: [{ family: "The Zhou family", why: "payment plan agreed" }],
}) as never;

describe("Vane's fee reminders", () => {
  it("fills in each family's own name, pupil and amount", () => {
    expect(reminderFor("Dear [family], [pupil] owes [amount]. [amount] in all.", { studentId: "s1", family: "The Moyo family", pupil: "Rumbidzai", amount: "USD 1,420.00" })).toBe(
      "Dear The Moyo family, Rumbidzai owes USD 1,420.00. USD 1,420.00 in all.",
    );
  });

  it("says how many it sends and who it leaves out, and lets the words be changed", () => {
    expect(remind.verb(params)).toBe("Send 2 reminders");
    expect(remind.title(params)).toBe("Remind 2 families of Third term fees; 1 left out (payment plan agreed)");
    expect(remind.fields.map((field) => field.name)).toEqual(["subject", "body"]);
  });
});
