/**
 * The rail and the sidebar are one definition, in two shapes.
 *
 * R-4.7 gave `RetailShell` a tab rail. R-4.6 had just finished deleting
 * `RETAIL_TABS` because retail had two navigation definitions that could
 * disagree — and did: the old list carried alias paths (`/retail/sell`,
 * `/retail/buy`) that existed only to hold a feature key, so every surface was
 * gated on `retail.core` in the nav while the page itself enforced something
 * tighter.
 *
 * A rail with its own list of destinations would put that back. So
 * `lib/retail/areas.ts` groups hrefs rather than declaring them, and this
 * asserts the grouping stays honest **in both directions**:
 *
 *  - every href in an area exists in `lib/navigation.ts`, so the rail cannot
 *    link somewhere the sidebar does not know about;
 *  - every retail href in `lib/navigation.ts` appears in exactly one area, so a
 *    screen added to the sidebar cannot quietly fall out of the rail.
 *
 * One direction alone would not do. The first catches an invented link; the
 * second catches the far more likely failure — somebody adds a Setup screen,
 * the sidebar grows a nineteenth row, and the Setup rail silently does not.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { navSections } from "@/lib/navigation";

import { RETAIL_AREAS, resolveRetailArea, retailRailFor } from "@corelithzw/module-sell/areas";

/**
 * Every retail href the sidebar declares.
 *
 * Taken from the `retail` section only. `retail-customers` is a second section
 * pointing at `/retail/customers` under the `crm.customers` key — a deliberate
 * duplicate for tenants that buy the customer ledger without the till — and
 * counting it would make the "exactly one area" assertion fail on a path that
 * is correctly listed twice.
 */
const sidebarHrefs = (() => {
  const section = navSections.find((entry) => entry.id === "retail");
  if (!section) throw new Error("No 'retail' section in lib/navigation.ts");
  return section.items.map((item) => item.href);
})();

const areaHrefs = RETAIL_AREAS.flatMap((area) => area.screens.map((screen) => screen.href));

describe("the rail and the sidebar agree", () => {
  it("finds both lists at all", () => {
    // A silent zero here would make every assertion below vacuously true.
    expect(sidebarHrefs.length).toBeGreaterThan(10);
    expect(areaHrefs.length).toBeGreaterThan(10);
  });

  it("links nowhere the sidebar does not know about", () => {
    expect(areaHrefs.filter((href) => !sidebarHrefs.includes(href))).toEqual([]);
  });

  it("groups every sidebar screen into an area", () => {
    expect(sidebarHrefs.filter((href) => !areaHrefs.includes(href))).toEqual([]);
  });

  it("puts each screen in exactly one area", () => {
    const seen = new Map<string, number>();
    for (const href of areaHrefs) seen.set(href, (seen.get(href) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([href]) => href)).toEqual([]);
  });

  it("gives every area a distinct id", () => {
    const ids = RETAIL_AREAS.map((area) => area.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolving a path to its screen", () => {
  it("resolves each screen to its own area", () => {
    for (const area of RETAIL_AREAS) {
      for (const screen of area.screens) {
        expect(resolveRetailArea(screen.href), screen.href).toMatchObject({
          area: { id: area.id },
          screen: { href: screen.href },
        });
      }
    }
  });

  /**
   * The trap the whole resolver exists for. `/retail` is a prefix of every
   * retail path, so a `startsWith` match would resolve `/retail/stock/count` to
   * the Overview area and show no rail on a screen that needs one.
   */
  it("does not let /retail swallow every path", () => {
    expect(resolveRetailArea("/retail/stock/count")?.area.id).toBe("stock");
    expect(resolveRetailArea("/retail")?.area.id).toBe("overview");
  });

  /** `/retail/stock` is a prefix of `/retail/stock/count`. Longest wins. */
  it("prefers the longer match between a screen and its prefix", () => {
    expect(resolveRetailArea("/retail/stock")?.screen.href).toBe("/retail/stock");
    expect(resolveRetailArea("/retail/stock/transfers")?.screen.href).toBe(
      "/retail/stock/transfers",
    );
  });

  it("tolerates a trailing slash", () => {
    expect(resolveRetailArea("/retail/setup/branding/")?.screen.href).toBe(
      "/retail/setup/branding",
    );
  });

  it("returns null for anything that is not a retail screen", () => {
    for (const path of ["/gold", "/retail/sales/8f9c", "/retailing", "", "/"]) {
      expect(resolveRetailArea(path), path).toBeNull();
    }
  });
});

describe("which paths get a rail", () => {
  /**
   * A rail with one tab is a decoration. It costs a row of vertical space on a
   * laptop and says nothing the page heading above it has not already said.
   */
  it("shows none for a single-screen area", () => {
    for (const href of ["/retail", "/retail/sales", "/retail/shifts", "/retail/reports"]) {
      expect(retailRailFor(href), href).toBeNull();
    }
  });

  it("shows one for every multi-screen area", () => {
    for (const area of RETAIL_AREAS.filter((entry) => entry.screens.length > 1)) {
      const rail = retailRailFor(area.screens[0].href);
      expect(rail?.area.id, area.id).toBe(area.id);
      expect(rail?.activeHref).toBe(area.screens[0].href);
    }
  });

  it("marks the screen you are on as the active tab", () => {
    expect(retailRailFor("/retail/setup/pos-policy")?.activeHref).toBe("/retail/setup/pos-policy");
    expect(retailRailFor("/retail/merchandising/promotions")?.activeHref).toBe(
      "/retail/merchandising/promotions",
    );
  });

  it("shows none off a retail path", () => {
    expect(retailRailFor("/gold/pours")).toBeNull();
  });
});

/**
 * A detail route resolves to no screen, and should still show its list's rail.
 *
 * `/retail/catalog/{uuid}` is not one of the screens on the Range rail, so
 * `resolveRetailArea` returns null for it and the page would sit one level deep
 * with no sideways move — which is exactly where a manager lands after
 * following a link out of an audit row.
 *
 * The page names its area rather than the resolver parsing it out of the path.
 * The segment before the uuid is not reliably the list —
 * `/retail/merchandising/promotions/{id}` is two levels down — and a wrong
 * guess is a rail pointing at the wrong part of the shop.
 */
describe("detail routes", () => {
  it("resolve to no screen on their own", () => {
    for (const path of [
      "/retail/catalog/8f9c",
      "/retail/sales/8f9c",
      "/retail/shifts/8f9c",
      "/retail/purchasing/orders/8f9c",
    ]) {
      expect(resolveRetailArea(path), path).toBeNull();
      expect(retailRailFor(path), path).toBeNull();
    }
  });

  it("show their list's rail when they name the area", () => {
    const range = retailRailFor("/retail/catalog/8f9c", "range");
    expect(range?.area.id).toBe("range");
    expect(range?.area.screens.map((screen) => screen.href)).toContain("/retail/catalog");

    const purchasing = retailRailFor("/retail/purchasing/orders/8f9c", "purchasing");
    expect(purchasing?.area.id).toBe("purchasing");
  });

  /**
   * No tab is active. The detail page is not one of the screens on the rail,
   * and marking its list active would tell the reader they are looking at the
   * list when they are looking at one row of it.
   */
  it("mark no tab active", () => {
    expect(retailRailFor("/retail/catalog/8f9c", "range")?.activeHref).toBe("");
  });

  /** A single-screen area still gets nothing — one tab is not navigation. */
  it("get no rail from a single-screen area", () => {
    expect(retailRailFor("/retail/sales/8f9c", "sales")).toBeNull();
    expect(retailRailFor("/retail/shifts/8f9c", "shifts")).toBeNull();
  });

  /**
   * A named area never overrides a path that resolves on its own. Otherwise a
   * copy-pasted `area` prop on a list page would quietly stop highlighting the
   * tab the reader is on.
   */
  it("do not let a named area override a real screen", () => {
    expect(retailRailFor("/retail/setup/pos-policy", "range")?.area.id).toBe("setup");
  });
});

/**
 * `04-composition.md` step 2: **max 3 actions, exactly 1 primary.**
 *
 * `RetailShell` takes actions as a `ReactNode` and cannot count them —
 * `Children.count` sees one fragment or one `<div>` regardless of what is
 * inside. So the count happens here, in the source, where a fragment and a
 * wrapper look the same.
 *
 * This is a lint, not a proof: it counts `<Button` inside the `actions={…}`
 * prop by bracket depth. A page that builds its actions in a variable escapes
 * it. That is worth having anyway — the failure it catches is the common one, a
 * screen that accreted a fourth "quick link" button over three commits.
 */
describe("page actions stay within the composition budget", () => {
  const pages = [
    "app/retail/page.tsx",
    "app/retail/sales/page.tsx",
    "app/retail/shifts/page.tsx",
    "app/retail/customers/page.tsx",
    "app/retail/catalog/page.tsx",
    "app/retail/merchandising/pricing/page.tsx",
    "app/retail/merchandising/promotions/page.tsx",
    "app/retail/stock/page.tsx",
    "app/retail/stock/count/page.tsx",
    "app/retail/stock/transfers/page.tsx",
    "app/retail/purchasing/orders/page.tsx",
    "app/retail/purchasing/receipts/page.tsx",
    "app/retail/reports/page.tsx",
    "app/retail/setup/page.tsx",
    "app/retail/setup/operations/page.tsx",
    "app/retail/setup/branding/page.tsx",
    "app/retail/setup/pos-policy/page.tsx",
    "app/retail/setup/accounting/page.tsx",
  ];

  /** The text of the `actions={…}` prop, by brace depth. */
  function actionsProp(source: string): string | null {
    const start = source.indexOf("actions={");
    if (start < 0) return null;
    let depth = 0;
    for (let index = start + "actions=".length; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
      }
    }
    return null;
  }

  it.each(pages)("%s declares at most three actions", (page) => {
    const source = readFileSync(join(process.cwd(), page), "utf8");
    const prop = actionsProp(source);
    if (!prop) return;
    const buttons = (prop.match(/<Button\b/g) ?? []).length;
    expect(buttons, `${page} has ${buttons} action buttons`).toBeLessThanOrEqual(3);
  });
});
