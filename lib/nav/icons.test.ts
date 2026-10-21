import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NAV_NODES } from "./registry";

const ROOT = path.resolve(__dirname, "../..");

describe("nav icons", () => {
  const generated = fs.readFileSync(path.join(ROOT, "lib/icons/corelith-nav.generated.tsx"), "utf8");
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, "design/nav/icons/icons.json"), "utf8")) as Record<string, unknown>;
  const names = [...new Set(NAV_NODES.flatMap((n) => [n.icon, ...(n.kids ?? []).map((k) => k.icon)]))];

  it("names only icons that are in the Corelith pack", () => {
    expect(names.filter((name) => !pack[name])).toEqual([]);
  });

  it("has a generated component for every icon the registry names (run scripts/icons/build-corelith.mjs)", () => {
    expect(names.filter((name) => !generated.includes(`${JSON.stringify(name)}:`))).toEqual([]);
  });
});
