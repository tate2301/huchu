/**
 * Answer storage, without a database.
 *
 * These pin the two decisions that are easy to get wrong later: which column a
 * given answer type lands in, and what counts as "the rep has dealt with this".
 */
import { describe, expect, it } from "vitest";

import { isAnswered, sectionProgress, valueColumnsFor } from "@/lib/crm/site-visits/answers";

describe("valueColumnsFor", () => {
  it("puts text in valueText", () => {
    expect(valueColumnsFor("SHORT_TEXT", "Warehouse floor").valueText).toBe("Warehouse floor");
  });

  it("parses a number typed as a string, which is what an input gives you", () => {
    expect(valueColumnsFor("NUMBER", "450").valueNumber).toBe(450);
    expect(valueColumnsFor("NUMBER", 450).valueNumber).toBe(450);
  });

  it("keeps a number column null rather than NaN when the text is not a number", () => {
    // A visit must not be lost because one field arrived as "approx 400".
    expect(valueColumnsFor("NUMBER", "approx 400").valueNumber).toBeNull();
  });

  it("reads the yes/no forms a phone actually sends", () => {
    expect(valueColumnsFor("BOOLEAN", true).valueBool).toBe(true);
    expect(valueColumnsFor("BOOLEAN", "yes").valueBool).toBe(true);
    expect(valueColumnsFor("BOOLEAN", "Yes").valueBool).toBe(true);
    expect(valueColumnsFor("BOOLEAN", "no").valueBool).toBe(false);
  });

  it("records a single select in both the text and the options column", () => {
    // valueText so it reads naturally on a report; valueOptions so a filter
    // over one question works the same whether it is single or multi.
    const columns = valueColumnsFor("SINGLE_SELECT", "Indoor");
    expect(columns.valueText).toBe("Indoor");
    expect(columns.valueOptions).toEqual(["Indoor"]);
  });

  it("accepts a multi select as an array, or as one value", () => {
    expect(valueColumnsFor("MULTI_SELECT", ["Dirt", "Moisture"]).valueOptions).toEqual([
      "Dirt",
      "Moisture",
    ]);
    expect(valueColumnsFor("MULTI_SELECT", "Dirt").valueOptions).toEqual(["Dirt"]);
  });

  it("stores a dimension as width and height", () => {
    const columns = valueColumnsFor("DIMENSION", { widthM: 1.2, heightM: 1.8 });
    expect(columns.valueJson).toEqual({ widthM: 1.2, heightM: 1.8 });
  });

  it("ignores a malformed dimension instead of throwing", () => {
    expect(valueColumnsFor("DIMENSION", "1.2 by 1.8").valueJson).toBeNull();
  });

  it("treats every empty form of a value as unanswered", () => {
    for (const empty of [null, undefined, ""]) {
      expect(isAnswered(valueColumnsFor("SHORT_TEXT", empty))).toBe(false);
    }
  });

  it("counts a false boolean as answered", () => {
    // "Is there existing paint?" answered No is an answer, not a blank.
    expect(isAnswered(valueColumnsFor("BOOLEAN", false))).toBe(true);
  });
});

describe("sectionProgress", () => {
  const questions = [
    { key: "total_area", isRequired: true },
    { key: "existing_substrate", isRequired: true },
    { key: "line_marking", isRequired: false },
  ];

  it("counts what the rep has addressed", () => {
    const progress = sectionProgress(questions, [
      { questionKey: "total_area", notApplicable: false, answered: true },
    ]);
    expect(progress).toEqual({
      answered: 1,
      total: 3,
      requiredOutstanding: ["existing_substrate"],
    });
  });

  it("counts an explicit not-applicable as addressed", () => {
    // A bar that can never fill because three questions do not apply to this
    // site is a bar people learn to ignore.
    const progress = sectionProgress(questions, [
      { questionKey: "total_area", notApplicable: false, answered: true },
      { questionKey: "existing_substrate", notApplicable: true, answered: false },
      { questionKey: "line_marking", notApplicable: true, answered: false },
    ]);
    expect(progress.answered).toBe(3);
    expect(progress.requiredOutstanding).toEqual([]);
  });

  it("reports nothing outstanding for a section with no questions", () => {
    expect(sectionProgress([], [])).toEqual({
      answered: 0,
      total: 0,
      requiredOutstanding: [],
    });
  });
});
