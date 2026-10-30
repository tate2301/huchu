import { describe, expect, it } from "vitest";

import { closeFinding, type CloseCheck } from "./close";

const check = (state: CloseCheck["state"]): CloseCheck => ({ key: "journals", label: "", state, note: "", action: null });

describe("closeFinding", () => {
  it("says how many checks hold the month, and what is taking postings", () => {
    expect(closeFinding({ month: "September", checks: [check("open"), check("done"), check("open"), check("done"), check("failed")] }, { month: "October" })).toEqual({
      fact: "September can’t close yet.",
      rest: "3 of the 5 checks are still open. October is open and taking postings.",
    });
    expect(closeFinding({ month: "September", checks: [check("done")] }, null)).toEqual({
      fact: "September is ready to close.",
      rest: "Every check passes.",
    });
    expect(closeFinding(null, { month: "October" })).toEqual({ fact: "Nothing is due to close.", rest: "October is open and taking postings." });
  });
});
