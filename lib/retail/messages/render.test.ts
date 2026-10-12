import { describe, expect, it } from "vitest";

import { firstName, OFFER_PLACEHOLDERS, offerValues, placeholderProblem, renderMessage } from "./render";

const BOARD =
  "Hi {first name}, Savanna Dry is two for US$5 this month end, 25 to 31 October. You have {points} points to spend. Harare Bottle Store.";

describe("filling a message", () => {
  it("fills the first name and the points with commas", () => {
    expect(renderMessage(BOARD, offerValues({ name: "Tapiwa Marange", points: 3021 }))).toBe(
      "Hi Tapiwa, Savanna Dry is two for US$5 this month end, 25 to 31 October. You have 3,021 points to spend. Harare Bottle Store.",
    );
  });

  it("fills every place a placeholder stands, whatever its spacing and case", () => {
    expect(renderMessage("{First Name}! {first  name}, {points}", { "first name": "Nyasha", points: "12" })).toBe("Nyasha! Nyasha, 12");
  });

  it("fills a reminder's own placeholders", () => {
    expect(renderMessage("Hi {first name}, {owed} is owed, {overdue} overdue.", { "first name": "Rudo", owed: "US$40.00", overdue: "US$12.00" })).toBe(
      "Hi Rudo, US$40.00 is owed, US$12.00 overdue.",
    );
  });

  it("takes the first word of the name, but not an initial", () => {
    expect(firstName("Tapiwa Marange")).toBe("Tapiwa");
    expect(firstName("  Nyasha   Gwenzi ")).toBe("Nyasha");
    expect(firstName("T. Marange")).toBe("T. Marange");
    expect(firstName("Madonna")).toBe("Madonna");
  });
});

describe("placeholders that do not fill in", () => {
  it("passes the offer's two, and text with none", () => {
    expect(placeholderProblem(BOARD, OFFER_PLACEHOLDERS)).toBeNull();
    expect(placeholderProblem("Two for US$5 this weekend.", OFFER_PLACEHOLDERS)).toBeNull();
  });

  it("refuses any other, saying which do", () => {
    expect(placeholderProblem("Hi {name}", OFFER_PLACEHOLDERS)).toBe("Only {first name} and {points} fill in.");
    expect(placeholderProblem("You owe {owed}", OFFER_PLACEHOLDERS)).toBe("Only {first name} and {points} fill in.");
  });

  it("says a reminder source's own words", () => {
    const words = "{first name}, {owed} and {overdue} fill in for each account.";
    expect(placeholderProblem("Hi {points}", ["first name", "owed", "overdue"], words)).toBe(words);
    expect(placeholderProblem("Hi {first name}, {owed}", ["first name", "owed", "overdue"], words)).toBeNull();
  });
});
