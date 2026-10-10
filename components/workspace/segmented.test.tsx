// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Segmented } from "./segmented";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RANGE = [
  { value: "3m", label: "3 months" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
];

describe("Segmented", () => {
  it("marks exactly one item pressed", () => {
    const html = renderToStaticMarkup(<Segmented aria-label="Range" items={RANGE} value="12m" />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-pressed="true">12 months</);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Range"');
  });

  it("is a block field when asked", () => {
    const html = renderToStaticMarkup(<Segmented items={RANGE} value="3m" block />);
    expect(html).toContain('class="cx-seg cx-seg--block cx-seg--field"');
  });

  it("reports a new choice and ignores the current one", () => {
    const onValueChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Segmented items={RANGE} value="12m" onValueChange={onValueChange} />));
    const [threeMonths, twelveMonths] = Array.from(container.querySelectorAll("button"));
    act(() => twelveMonths.click());
    expect(onValueChange).not.toHaveBeenCalled();
    act(() => threeMonths.click());
    expect(onValueChange).toHaveBeenCalledWith("3m");
    act(() => root.unmount());
  });
});
