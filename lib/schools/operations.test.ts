/** Fee reminders drafted by Vane: each family's own words, who is ticked, and what the approval says it will do. */
import { describe, expect, it } from "vitest";

import { formatSchoolMoney } from "@/lib/schools/format";

import { OPERATIONS } from "@/lib/operations/registry";
import { reminderFor, remindedFamilies, remindParams } from "./operations";

const remind = OPERATIONS.find((action) => action.key === "schools.fees.remind")!;
const draft = {
  term: "Third term",
  currency: "USD",
  subject: "Third-term fees",
  body: "Dear [family], Mazowe High has not yet received third-term fees for [pupil]: [amount].",
  families: [
    { studentId: "s1", family: "The Moyo family", pupil: "Rumbidzai, Form 3B", owed: 1420 },
    { studentId: "s2", family: "The Ncube family", pupil: "Tafadzwa, Form 4A", owed: 1180 },
    { studentId: "s3", family: "The Zhou family", pupil: "Tinashe, Form 2C", owed: 640, why: "payment plan agreed" },
  ],
  skip: ["s3"],
};
const params = remind.input.parse(draft) as never;

describe("Vane's fee reminders", () => {
  it("fills in each family's own name, pupil and amount", () => {
    expect(reminderFor("Dear [family], [pupil] owes [amount]. [amount] in all.", draft.families[0]!, "USD")).toBe(
      `Dear The Moyo family, Rumbidzai, Form 3B owes ${formatSchoolMoney(1420, "USD")}. ${formatSchoolMoney(1420, "USD")} in all.`,
    );
  });

  it("reminds the ticked families, and says who it leaves out and why", () => {
    expect(remindedFamilies(draft).map((family) => family.studentId)).toEqual(["s1", "s2"]);
    expect(remind.verb(params)).toBe("Send 2 reminders");
    expect(remind.title(params)).toBe("Remind 2 families of Third term fees; 1 left out (payment plan agreed)");
  });

  it("lets the words change on the card, and the ticks only on its own page", () => {
    expect(remind.fields.map((field) => field.name)).toEqual(["subject", "body"]);
    expect(remind.pageFields).toEqual(["skip"]);
    expect(remind.target(params, "a1")).toBe("/schools/finance/reminders/a1");
  });

  it("leaves out only a family on the list, and sends to at least one", () => {
    expect(remindParams.safeParse({ ...draft, skip: ["someone-else"] }).success).toBe(false);
    expect(remindParams.safeParse({ ...draft, skip: ["s1", "s2", "s3"] }).success).toBe(false);
  });
});
