import { describe, expect, it } from "vitest";
import { moduleBoundaryViolations } from "./module-boundary";

describe("module boundary helper", () => {
  it("passes the kernel itself, which imports no host and no module", () => {
    expect(moduleBoundaryViolations({ dir: __dirname + "/..", manifest: { id: "platform" } })).toEqual([]);
  });

  it("names a missing package root rather than passing it vacuously", () => {
    const violations = moduleBoundaryViolations({ dir: __dirname + "/does-not-exist", manifest: { id: "x" } });
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toMatch(/does not exist/);
  });
});
