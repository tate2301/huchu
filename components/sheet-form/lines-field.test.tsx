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
});
