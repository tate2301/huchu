import { describe, expect, it } from "vitest";

import {
  CLASS_LADDER,
  classStage,
  classVocabulary,
  levelFor,
  rungName,
  stageOrdinal,
} from "./class-stage";

/**
 * The ladder is the thing two writers disagreed about, so it is the thing the
 * tests pin. `provisionSchool` builds its class list from `CLASS_LADDER` and
 * the New class dialog offers the same rungs, which is only safe while the
 * numbering here is the numbering every existing tenant is already on.
 */
describe("the class ladder", () => {
  it("is the one provisioning has always written", () => {
    const byName = new Map(CLASS_LADDER.map((rung) => [rung.name, rung.level]));
    expect(byName.get("ECD A")).toBe(0);
    expect(byName.get("ECD B")).toBe(0);
    expect(byName.get("Grade 1")).toBe(1);
    expect(byName.get("Grade 7")).toBe(7);
    // The rung the dialog used to call 1, which is what broke the ordering.
    expect(byName.get("Form 1")).toBe(8);
    expect(byName.get("Form 6")).toBe(13);
  });

  it("orders top to bottom, so a list sorted by level reads as a school", () => {
    const levels = CLASS_LADDER.map((rung) => rung.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("names every rung uniquely even where two share a level", () => {
    const names = CLASS_LADDER.map((rung) => rung.name);
    expect(new Set(names).size).toBe(names.length);
    const codes = CLASS_LADDER.map((rung) => rung.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("classStage", () => {
  it("reads the stage off the rung", () => {
    expect(classStage(0)).toBe("ECD");
    expect(classStage(1)).toBe("GRADE");
    expect(classStage(7)).toBe("GRADE");
    expect(classStage(8)).toBe("FORM");
    expect(classStage(13)).toBe("FORM");
  });

  it("has no stage for a class with no rung", () => {
    // `SchoolClass.level` is nullable and always has been. A class created
    // through the API without one gets the neutral word, not a guess.
    expect(classStage(null)).toBeNull();
    expect(classStage(undefined)).toBeNull();
    expect(classStage(Number.NaN)).toBeNull();
  });

  it("keeps a school with an extra secondary year on the secondary ladder", () => {
    expect(classStage(14)).toBe("FORM");
  });
});

describe("stageOrdinal and levelFor", () => {
  it("round-trip", () => {
    for (const rung of CLASS_LADDER) {
      if (rung.stage === "ECD") continue;
      expect(levelFor(rung.stage, stageOrdinal(rung.level))).toBe(rung.level);
    }
  });

  it("counts within the ladder, not across it", () => {
    expect(stageOrdinal(9)).toBe(2); // Form 2
    expect(stageOrdinal(4)).toBe(4); // Grade 4
  });
});

describe("rungName", () => {
  it("says what the school says", () => {
    expect(rungName(8)).toBe("Form 1");
    expect(rungName(4)).toBe("Grade 4");
    expect(rungName(0)).toBe("the ECD years");
    expect(rungName(null)).toBeNull();
  });
});

describe("classVocabulary", () => {
  it("says form to a secondary school", () => {
    expect(classVocabulary([8, 9, 10, 11]).one).toBe("form");
    expect(classVocabulary([8, 9]).Many).toBe("Forms");
  });

  it("says grade to a primary school", () => {
    expect(classVocabulary([1, 2, 3, 7]).one).toBe("grade");
  });

  it("counts ECD as primary, because nobody calls an ECD class a form", () => {
    expect(classVocabulary([0, 0, 1, 2]).one).toBe("grade");
  });

  it("says both to a combined school", () => {
    const words = classVocabulary([1, 2, 8, 9]);
    expect(words.one).toBe("form or grade");
    expect(words.many).toBe("forms or grades");
  });

  it("reads well in the slots the copy actually uses", () => {
    for (const levels of [[8], [1], [1, 8], []]) {
      const words = classVocabulary(levels);
      // "Every form", "Choose a grade", "No forms or grades yet" — the
      // singular does the distributive duty because a combined school's plural
      // is awkward there and its singular is not.
      expect(`Every ${words.one}`).not.toMatch(/\s\s/);
      expect(words.One[0]).toBe(words.One[0].toUpperCase());
      expect(words.one[0]).toBe(words.one[0].toLowerCase());
    }
  });

  it("falls back to the model's own word when no class carries a rung", () => {
    // Never wrong, only unspecific — which is the whole requirement here.
    expect(classVocabulary([]).one).toBe("class");
    expect(classVocabulary([null, undefined]).many).toBe("classes");
  });
});
