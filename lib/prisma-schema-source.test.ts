import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PRISMA_SCHEMA_DIR, readPrismaSchema } from "./prisma-schema-source";

describe("readPrismaSchema", () => {
  it("reads every .prisma file in the folder, in name order", () => {
    const root = mkdtempSync(path.join(tmpdir(), "schema-source-"));
    const dir = path.join(root, PRISMA_SCHEMA_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "milling.prisma"), "model MillingRun {}");
    writeFileSync(path.join(dir, "core.prisma"), "model Company {}");
    writeFileSync(path.join(dir, "README.md"), "not schema");

    expect(readPrismaSchema(root)).toBe("model Company {}\nmodel MillingRun {}");
  });

  it("reads this repository's schema, core models included", () => {
    expect(readPrismaSchema()).toMatch(/^model Company \{/m);
  });
});
