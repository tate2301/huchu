import { describe, it, expect } from "vitest";
import { accentFor } from "@corelithzw/react";

import { isAccent } from "./accents";
import { recordAccent } from "./record-accent";

describe("recordAccent", () => {
  it("prefers what somebody picked", () => {
    expect(recordAccent("teal", "Beacon")).toBe("teal");
  });

  it("falls back to the name when nothing was picked", () => {
    expect(recordAccent(null, "Beacon")).toBe(accentFor("Beacon"));
  });

  it("ignores a stored value that is not a hue", () => {
    // A colour dropped from the palette should not leave records uncoloured.
    expect(recordAccent("chartreuse", "Beacon")).toBe(accentFor("Beacon"));
  });

  it("still answers for a record with no name yet", () => {
    expect(isAccent(recordAccent(null, ""))).toBe(true);
  });

  it("gives the same record the same hue on every client", () => {
    expect(recordAccent(null, "Beacon Properties")).toBe(
      recordAccent(null, "Beacon Properties"),
    );
  });
});
