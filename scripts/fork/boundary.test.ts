import { describe, expect, it } from "vitest";

import { findViolations } from "./boundary-lib.mjs";

describe("fork boundary", () => {
  it("allows the vertical's own paths", () => {
    expect(
      findViolations(
        [
          "FORK.md",
          "extensions/index.ts",
          "extensions/server.ts",
          "extensions/milling/index.ts",
          "lib/milling/runs/approve.ts",
          "lib/milling/runs/approve.test.ts",
          "app/milling/production/page.tsx",
          "app/api/milling/runs/route.ts",
          "components/milling/run-form.tsx",
          "prisma/schema/milling.prisma",
          "prisma/migrations/20261201090000_milling_runs/migration.sql",
          "docs/milling/README.md",
        ],
        "milling",
      ),
    ).toEqual([]);
  });

  it("refuses core files, core migrations and look-alike paths", () => {
    expect(
      findViolations(
        [
          "lib/inventory/stock-movements.ts",
          "prisma/schema/core.prisma",
          "prisma/migrations/20261201090000_lots/migration.sql",
          "prisma/migrations/20261201090000_milling_runs/notes.md",
          "lib/milling-legacy/x.ts",
          "app/api/millingx/route.ts",
          ".github/workflows/fork-checks.yml",
          "package.json",
        ],
        "milling",
      ),
    ).toEqual([
      "lib/inventory/stock-movements.ts",
      "prisma/schema/core.prisma",
      "prisma/migrations/20261201090000_lots/migration.sql",
      "prisma/migrations/20261201090000_milling_runs/notes.md",
      "lib/milling-legacy/x.ts",
      "app/api/millingx/route.ts",
      ".github/workflows/fork-checks.yml",
      "package.json",
    ]);
  });

  it("keeps one fork's paths away from another's", () => {
    expect(findViolations(["lib/bakery/x.ts"], "milling")).toEqual(["lib/bakery/x.ts"]);
  });

  it("refuses a malformed flavour", () => {
    expect(() => findViolations([], "../core")).toThrow();
  });
});
