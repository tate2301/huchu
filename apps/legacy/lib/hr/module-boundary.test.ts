/**
 * The people, payroll and workflow modules do not import a vertical.
 *
 * The rule the payroll-only product stands on. Dependencies point inward —
 * toward `lib/money.ts`, `lib/accounting/`, `lib/documents/` and
 * `lib/platform/` — and never sideways into Gold, Schools, Retail or Autos.
 *
 * Why enforce it mechanically rather than by care: the boundary erodes on the
 * first convenient shortcut, and every shortcut is individually reasonable. One
 * `import { convertUsdToGrams } from "@/lib/gold/valuation"` in the payroll
 * engine and the payroll module no longer ships without the gold module — which
 * is discovered not at review time but when somebody provisions a payroll-only
 * workspace and a screen throws.
 *
 * **It covered `lib/hr/` only, and that is exactly how it was evaded.** The gold
 * coupling moved to `lib/hr-payroll.ts` — one directory up, outside the glob —
 * where a `buildGoldPaymentWhere` keyed on `GoldSettlementMode` sat on the import
 * path of all 41 approval call sites in the product. So the roots are listed
 * explicitly below and every new directory in this family joins the list.
 *
 * The direction is deliberately asymmetric. `lib/gold/payouts.ts` may reach into
 * HR's shape, and does — that is the sanctioned seam. HR reaching back is what
 * this forbids.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HR_ROOT = join(process.cwd(), "lib/hr");

/**
 * Every directory that must stay vertical-free.
 *
 * `lib/workflow` is here because approvals are not an HR concept — eight domains
 * write `ApprovalAction`, and a vertical import there reaches all of them.
 */
const GUARDED_ROOTS = [
  "lib/hr",
  "lib/people",
  "lib/payroll",
  "lib/workflow",
  // Settlements sits downstream of gold and scrap, and reads their tables — but
  // reading a shared Prisma model is not importing a vertical's logic. Keeping it
  // guarded is what stopped the rewrite from reaching for `convertUsdToGrams`
  // again: quantity is a column now, so nothing needs converting.
  "lib/settlements",
].map((relative) => join(process.cwd(), relative));

/** Verticals HR must not depend on. */
const FORBIDDEN_IMPORTS = [
  "@/lib/gold/",
  "@/lib/schools/",
  "@/lib/retail/",
  "@/lib/autos/",
  "@/lib/scrap-metal/",
  "@/lib/crm/",
  "@/lib/cctv/",
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      found.push(full);
    }
  }
  return found;
}

const files = GUARDED_ROOTS.filter((root) => existsSync(root)).flatMap(sourceFiles);

describe("HR module boundary", () => {
  it("finds the guarded source files", () => {
    // Guards against a rename quietly making every assertion below vacuous.
    expect(files.length).toBeGreaterThan(4);
  });

  it("has no unguarded sibling holding the shared workflow helpers", () => {
    // `lib/hr-payroll.ts` was that sibling: 308 lines of approvals, period maths
    // and one gold query builder, sitting one directory above the glob that was
    // supposed to keep gold out. It is gone, and this fails if it comes back.
    //
    // `lib/hr-irregular-payouts.ts` is the remaining offender and moves into
    // `lib/settlements/` with the settlement tables, which is where its source
    // enum belongs. It is deliberately not asserted here yet — a test that is
    // known-red says nothing.
    for (const orphan of ["lib/hr-payroll.ts", "lib/payroll-shared.ts"]) {
      expect(
        existsSync(join(process.cwd(), orphan)),
        `${orphan} is outside every guarded root, so nothing stops a vertical ` +
          `import in it. Put it under one of the ${GUARDED_ROOTS.length} guarded roots.`,
      ).toBe(false);
    }
  });

  it.each(files.map((file) => [file.replace(process.cwd() + "/", ""), file]))(
    "%s imports no vertical",
    (label, file) => {
      const source = readFileSync(file, "utf8");
      const offenders = FORBIDDEN_IMPORTS.filter((prefix) => source.includes(prefix));
      expect(
        offenders,
        `${label} imports ${offenders.join(", ")} — HR must not depend on a vertical. ` +
          `If payroll needs something a vertical owns, the vertical registers it or ` +
          `payroll reads the shared model.`,
      ).toEqual([]);
    },
  );

  it("keeps the engine free of Prisma so it can be tested without a database", () => {
    // `computePayroll` takes resolved rates and returns components. The moment it
    // reads a table itself, the 38 hand-worked arithmetic tests need a Postgres,
    // and the arithmetic stops being checkable against a ZIMRA circular.
    const engine = readFileSync(join(HR_ROOT, "payroll/engine.ts"), "utf8");
    expect(engine.includes("@corelithzw/db/client")).toBe(false);
    expect(engine.includes("prisma.")).toBe(false);
  });

  it("keeps the engine free of feature flags", () => {
    // Whether a workspace has accounting is the caller's business. An engine that
    // asked would be an engine that behaves differently in a test than in
    // production.
    const engine = readFileSync(join(HR_ROOT, "payroll/engine.ts"), "utf8");
    expect(engine.includes("hasEnabledFeature")).toBe(false);
    expect(engine.includes("hasFeature")).toBe(false);
  });
});
