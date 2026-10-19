import { describe, expect, it } from "vitest";

import { vatFinding } from "./vat";

describe("vatFinding", () => {
  it("says where the open return stands and what is due", () => {
    expect(vatFinding({ month: "September", state: "reviewed", net: 1227.2, due: "25 October" }, null)).toEqual({
      fact: "September's return is reviewed, not finalised.",
      rest: "US$1,227.20 is due to ZIMRA by 25 October.",
    });
    expect(vatFinding({ month: "September", state: "draft", net: -40, due: null }, null).rest).toBe("ZIMRA owes you US$40.00.");
  });

  it("says when everything is filed, or nothing is prepared", () => {
    expect(vatFinding(null, { month: "August", filedOn: "20 September" })).toEqual({
      fact: "Every return is filed.",
      rest: "August's was filed on 20 September.",
    });
    expect(vatFinding(null, null).fact).toBe("No VAT return yet.");
  });
});
