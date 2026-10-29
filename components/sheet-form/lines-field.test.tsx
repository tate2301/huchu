// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { LinesField } from "./lines-field";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The `lines` field (00-foundations 5.7.4): a line whose cost is not known
 * (blank) reads "—" under Cost and Value, not US$0.00, and the Σ value is
 * the lines that have one.
 */

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("LinesField", () => {
  it("draws an unknown cost as a dash and leaves it out of the Σ value", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <QueryClientProvider client={new QueryClient()}>
          <LinesField
            id="levels"
            label="Levels"
            noun="stock-line"
            currency="US$"
            quantityLabel="Reorder at"
            value={[
              { productId: "jw", name: "Johnnie Walker Black 750ml", sub: null, quantity: "32", cost: "33.60" },
              { productId: "zc", name: "Zambezi Gin 750ml", sub: null, quantity: "6", cost: "" },
            ]}
            onValueChange={() => {}}
          />
        </QueryClientProvider>,
      ),
    );
    const rows = [...host.querySelectorAll(".sf-lines__row")].map((row) =>
      [...row.querySelectorAll('[role="cell"]')].slice(2, 4).map((cell) => cell.textContent),
    );
    expect(rows[0]).toEqual(["US$33.60", "US$1,075.20"]);
    expect(rows[1]).toEqual(["—", "—"]);
    expect(host.querySelector(".sf-lines__totals")!.textContent).toContain("US$1,075.20");
  });

  it("allows editing the buying price when editableCost is enabled", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    let updatedValue: unknown = null;

    act(() =>
      root!.render(
        <QueryClientProvider client={new QueryClient()}>
          <LinesField
            id="order-lines"
            label="Order Lines"
            noun="product"
            currency="US$"
            quantityLabel="Quantity"
            costLabel="Buying price"
            editableCost={true}
            value={[
              { productId: "p1", name: "Castle Lager 330ml", sub: null, quantity: "10", cost: "1.00" },
            ]}
            onValueChange={(val) => {
              updatedValue = val;
            }}
          />
        </QueryClientProvider>,
      ),
    );

    const costInput = host.querySelector<HTMLInputElement>(".sf-lines__cost-input input");
    expect(costInput).not.toBeNull();
    expect(costInput?.value).toBe("1.00");

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(costInput, "1.25");
      costInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(updatedValue).toEqual([
      { productId: "p1", name: "Castle Lager 330ml", sub: null, quantity: "10", cost: "1.25", touched: true },
    ]);
  });

  it("visualizes financial variables (buying cost, retail revenue, profit, margin %, markup %) and multi-supplier orders", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() =>
      root!.render(
        <QueryClientProvider client={new QueryClient()}>
          <LinesField
            id="order-lines"
            label="Order Lines"
            noun="product"
            currency="US$"
            quantityLabel="Quantity"
            costLabel="Buying price"
            editableCost={true}
            showFinancials={true}
            value={[
              {
                productId: "p1",
                name: "Coca Cola 330ml",
                sub: "Beverage",
                quantity: "10",
                cost: "0.50",
                price: "1.00",
                supplierName: "Delta",
              },
              {
                productId: "p2",
                name: "Lacto 500ml",
                sub: "Dairy",
                quantity: "20",
                cost: "0.75",
                price: "1.25",
                supplierName: "Dairibord",
              },
            ]}
            onValueChange={() => {}}
          />
        </QueryClientProvider>,
      ),
    );

    const financialsEl = host.querySelector(".sf-lines__financials");
    expect(financialsEl).not.toBeNull();

    // Total Cost: 10 * 0.50 + 20 * 0.75 = 5.00 + 15.00 = 20.00
    expect(financialsEl?.textContent).toContain("US$20.00");
    // Retail Revenue: 10 * 1.00 + 20 * 1.25 = 10.00 + 25.00 = 35.00
    expect(financialsEl?.textContent).toContain("US$35.00");
    // Gross Profit: 35.00 - 20.00 = 15.00
    expect(financialsEl?.textContent).toContain("US$15.00");
    // Margin %: (15 / 35) * 100 = 42.9%
    expect(financialsEl?.textContent).toContain("42.9%");
    // Markup %: (15 / 20) * 100 = 75.0%
    expect(financialsEl?.textContent).toContain("75.0%");
    // Multi-supplier note
    expect(financialsEl?.textContent).toContain("Sourced from 2 suppliers: Delta, Dairibord");

    // Supplier badges rendered on the lines
    const badges = [...host.querySelectorAll(".sf-lines__badge")].map((b) => b.textContent);
    expect(badges).toEqual(["Delta", "Dairibord"]);
  });
});
