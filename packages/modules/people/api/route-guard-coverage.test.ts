/**
 * Every HR API route is guarded.
 *
 * A coverage test, not a behaviour test — the same shape as
 * `lib/schools/route-guard-coverage.test.ts` and for the same reason, which is
 * worse here than there.
 *
 * The route registry gates `/api/payroll/**` on `hr.payroll`, but that asks
 * whether the *tenant* bought payroll, never which signed-in person is calling.
 * Until this branch the only role check in HR was `ensureApproverRole`, and it
 * ran on approve endpoints only — so a company with payroll switched on exposed
 * every salary in the business to every signed-in user, an operator who marks
 * attendance included.
 *
 * A new route file fails this test until it declares who may call it. That is the
 * point: the failure mode being prevented is not a bug somebody introduces on
 * purpose, it is a route added in a hurry that nobody notices is open.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Every tree whose routes read or write payroll, pay or people. */
const HR_API_DIRS = [
  "payroll",
  "disbursements",
  "compensation",
  "employees",
  "employee-payments",
  "adjustments",
  "approvals",
  "hr",
  // People's own tree. Added when rosters and the attendance register moved out
  // of `app/api/hr/**` — without it those eight routes would have left this
  // coverage set silently, which is how a coverage test stops covering things.
  // Adding it is also what surfaced the attendance API having no role check at
  // all.
  "people",
].map((relative) => join(__dirname, relative));

/**
 * What counts as declaring who may call.
 *
 * `hrPermissionDenial` is the standard. `ensureApproverRole` predates it and is
 * still a genuine role check, so a route using only that is guarded — but it is
 * the weaker of the two, because it answers one question (manager or not) rather
 * than which resource and which action.
 */
const GUARD_MARKERS = [
  "hrPermissionDenial",
  "canHrRoleDo",
  "ensureApproverRole",
  // Coarser than the others — it asks "which role" and not "which action on which
  // resource" — but it is a genuine role check, and where it is used it is
  // *stricter*: the attendance register's DELETE is SUPERADMIN-only, which no
  // matrix action expresses, because `HrAction` has no `delete`. Adding one would
  // hand MANAGER a delete on every HR resource including payroll rows, which is
  // not a widening to make in passing.
  "hasRole(",
];

function routeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
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

const files = HR_API_DIRS.flatMap(routeFiles);

describe("HR API route guards", () => {
  it("finds the route files at all", () => {
    // A silent zero would make every assertion below vacuously true — which is
    // exactly how a coverage test rots into decoration.
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((file) => [file.replace(__dirname + "/", ""), file]))(
    "%s declares who may call it",
    (_label, file) => {
      const source = readFileSync(file, "utf8");

      // A file that only forwards inherits the guard of whatever it forwards to,
      // and is checked for actually being empty of its own logic rather than
      // merely importing a handler.
      const isBareReExport = /^export \{[^}]*\} from/m.test(source);
      if (isBareReExport) {
        expect(source.includes("prisma.")).toBe(false);
        return;
      }

      const guarded = GUARD_MARKERS.some((marker) => source.includes(marker));
      expect(guarded).toBe(true);
    },
  );

  it.each(files.map((file) => [file.replace(__dirname + "/", ""), file]))(
    "%s guards every exported handler, not just one",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      if (/^export \{[^}]*\} from/m.test(source)) return;

      // The bug this catches: a route whose POST is guarded and whose GET is not.
      // Every handler resolves a session, so counting sessions against guards is
      // a reliable proxy — and cheaper than parsing the file.
      const sessions = (source.match(/const \{ session \} = sessionResult/g) ?? []).length;
      const denials = (source.match(/hrPermissionDenial\(/g) ?? []).length;
      const approverChecks = (source.match(/ensureApproverRole\(/g) ?? []).length;
      const roleChecks = (source.match(/hasRole\(session/g) ?? []).length;

      if (sessions === 0) return;
      expect(denials + approverChecks + roleChecks).toBeGreaterThanOrEqual(sessions);
    },
  );
});
