import { describe, it, expect } from "vitest";
import { mergeCustomFields } from "./custom-fields";

describe("mergeCustomFields, as the record page uses it", () => {
  it("writing one property does not drop the others", () => {
    // The attribute row commits a single key. A replace would wipe the rest.
    const merged = mergeCustomFields(
      { roofType: "IBR", accessNotes: "gate code 1234" },
      { roofType: "Chromadek" },
    );
    expect(merged).toEqual({ roofType: "Chromadek", accessNotes: "gate code 1234" });
  });

  it("emptying a property keeps it present rather than forgetting it", () => {
    const merged = mergeCustomFields({ roofType: "IBR" }, { roofType: null });
    expect(merged).toEqual({ roofType: null });
  });

  it("starts from nothing when the record has never had one", () => {
    expect(mergeCustomFields(null, { roofType: "IBR" })).toEqual({ roofType: "IBR" });
  });
});
