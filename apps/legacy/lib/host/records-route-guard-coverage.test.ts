/**
 * Every module-neutral record route is guarded.
 *
 * S-4.2 — `/api/v2/records/**` gates per subject type, checking the owning
 * module's feature and then the caller's role (`guardRecordSubject`). It is
 * the only guard those routes have: they are deliberately absent from the route
 * registry, so the feature gate that protects every other /api/v2 path does not
 * run for them. A new route file fails this test until it declares who may
 * call it. The school's routes have the same test in their package.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RECORDS_API = join(process.cwd(), "app/api/v2/records");

const GUARD_MARKERS = [
  "guardRecordSubject",
  /**
   * S-4.5 — global search does not refuse, it narrows: an arm the caller's role
   * cannot see is not queried at all, so there is no denial to return and the
   * predicate underneath the guard is what decides. A route naming it is still
   * deciding by role.
   */
  "canSchoolRoleDo",
];

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full));
    } else if (entry === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

const files = routeFiles(RECORDS_API);

describe("shared-record API route guards", () => {
  it("finds the route files at all", () => {
    // A silent zero here would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(2);
  });

  it.each(files.map((file) => [file.replace(process.cwd() + "/", ""), file]))(
    "%s declares who may call it",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      const isBareReExport = /^export \{[^}]*\} from/m.test(source);
      if (isBareReExport) {
        expect(source.includes("prisma.")).toBe(false);
        return;
      }
      const guarded = GUARD_MARKERS.some((marker) => source.includes(marker));
      expect(guarded).toBe(true);
    },
  );
});
