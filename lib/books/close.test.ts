import { describe, expect, it } from "vitest";

import { closeFinding, type CloseCheck } from "./close";

const check = (state: CloseCheck["state"]): CloseCheck => ({ key: "journals", label: "", state, note: "", action: null });

describe("closeFinding", () => {
  it("says how many checks hold the month, and what is taking postings", () => {
    expect(closeFinding({ month: "September", checks: [check("open"), check("done"), check("open"), check("done"), check("failed")] }, { month: "October" })).toEqual({
      fact: "2 of 5 checks pass.",
      rest: "Three block the close.",
    });
    expect(closeFinding({ month: "September", checks: [check("open"), check("done")] }, null)).toEqual({ fact: "1 of 2 checks pass.", rest: "One blocks the close." });
    expect(closeFinding({ month: "September", checks: [check("done")] }, null)).toEqual({
      fact: "1 of 1 checks pass.",
      rest: "September is ready to close.",
    });
    expect(closeFinding(null, { month: "October" })).toEqual({ fact: "Nothing is due to close.", rest: "October is open and taking postings." });
    expect(closeFinding(null, { month: "October" }, { month: "September", voucher: "PCV-2026-09" })).toEqual({ fact: "September is closed.", rest: "Posted as PCV-2026-09." });
  });
});
