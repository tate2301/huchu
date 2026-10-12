import { describe, expect, it } from "vitest";

import { changeNotes, changeNoteWords } from "./change-notes";
import { splitChange } from "./payment-words";

describe("changeNoteWords", () => {
  it("gives the notes largest first, then the ZiG under the smallest note as coins", () => {
    expect(changeNoteWords({ usd: 3, zig: 11 })).toBe("US$2 · US$1 · ZiG 10 · ZiG 1 in coins");
  });

  it("counts a note given more than once", () => {
    expect(changeNoteWords({ usd: 47, zig: 0 })).toBe("2 × US$20 · US$5 · US$2");
  });

  it("follows the change split at the day's rate", () => {
    // US$3.40 at ZiG 26.80, rounded to whole ZiG: US$3 and ZiG 11.
    expect(changeNoteWords(splitChange(3.4, { rate: 26.8, rounding: "1" }))).toBe("US$2 · US$1 · ZiG 10 · ZiG 1 in coins");
  });

  it("puts cents with no ZiG to give as US coins", () => {
    expect(changeNoteWords({ usd: 1.4, zig: 0 })).toBe("US$1 · US$0.40 in coins");
  });

  it("keeps half a ZiG with the coins", () => {
    expect(changeNotes({ usd: 0, zig: 7.5 })).toEqual([
      { currency: "ZWG", note: 5, count: 1 },
      { currency: "ZWG", coins: 2.5 },
    ]);
  });

  it("is empty with nothing to give back", () => {
    expect(changeNoteWords({ usd: 0, zig: 0 })).toBe("");
  });
});
