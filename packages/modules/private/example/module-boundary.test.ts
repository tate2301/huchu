import { describe, expect, it } from "vitest";
import { moduleBoundaryViolations } from "@corelithzw/platform/testing/module-boundary";
import { manifest } from "./manifest";

describe("module boundary", () => {
  it("imports only the kernel and the modules it declares", () => {
    expect(moduleBoundaryViolations({ dir: __dirname, manifest })).toEqual([]);
  });

  it("carries the private prefix no public module has", () => {
    expect(manifest.id.startsWith("private-")).toBe(true);
  });
});
