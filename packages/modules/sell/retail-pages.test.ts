/**
 * The retail screens' composition budget: a page declares at most three actions.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    "pages/retail/page.tsx",
    "pages/retail/sales/page.tsx",
    "pages/retail/shifts/page.tsx",
    "pages/retail/customers/page.tsx",
    "pages/retail/catalog/page.tsx",
    "pages/retail/merchandising/pricing/page.tsx",
    "pages/retail/merchandising/promotions/page.tsx",
    "pages/retail/stock/page.tsx",
    "pages/retail/stock/count/page.tsx",
    "pages/retail/stock/transfers/page.tsx",
    "pages/retail/purchasing/orders/page.tsx",
    "pages/retail/purchasing/receipts/page.tsx",
    "pages/retail/reports/page.tsx",
    "pages/retail/setup/page.tsx",
    "pages/retail/setup/operations/page.tsx",
    "pages/retail/setup/branding/page.tsx",
    "pages/retail/setup/pos-policy/page.tsx",
    "pages/retail/setup/accounting/page.tsx",
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
    const source = readFileSync(join(__dirname, page), "utf8");
    const prop = actionsProp(source);
    if (!prop) return;
    const buttons = (prop.match(/<Button\b/g) ?? []).length;
    expect(buttons, `${page} has ${buttons} action buttons`).toBeLessThanOrEqual(3);
  });
});
