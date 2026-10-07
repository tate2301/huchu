// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tabs } from "./tabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDERS = [
  { value: "open", label: "Open", count: 3 },
  { value: "part", label: "Part delivered", count: 1 },
  { value: "closed", label: "Closed", count: 24 },
  { value: "all", label: "All", count: 28 },
];

describe("Tabs", () => {
  it("selects exactly one tab and puts only it in the tab order", () => {
    const html = renderToStaticMarkup(<Tabs aria-label="Orders" items={ORDERS} value="closed" />);
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true" tabindex="0" class="cx-tab">Closed<span class="cx-count cx-count--tab">24<\/span>/);
  });

  it("moves with the arrow keys, Home and End", () => {
    function Harness() {
      const [value, setValue] = useState("open");
      return <Tabs aria-label="Orders" items={ORDERS} value={value} onValueChange={setValue} />;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Harness />));
    const selected = () => container.querySelector('[aria-selected="true"]')?.textContent;
    const press = (key: string) =>
      act(() => {
        (document.activeElement ?? container.querySelector('[aria-selected="true"]'))!.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true }),
        );
      });

    (container.querySelector('[aria-selected="true"]') as HTMLElement).focus();
    press("ArrowLeft");
    expect(selected()).toBe("All28");
    press("ArrowRight");
    expect(selected()).toBe("Open3");
    press("End");
    expect(selected()).toBe("All28");
    press("Home");
    expect(selected()).toBe("Open3");
    expect(document.activeElement?.textContent).toBe("Open3");
    act(() => root.unmount());
    container.remove();
  });
});
