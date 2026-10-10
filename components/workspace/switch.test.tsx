// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Switch, SwitchRow } from "./switch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Switch", () => {
  it("is a switch with aria-checked", () => {
    const on = renderToStaticMarkup(<Switch checked aria-label="Deposits" />);
    const off = renderToStaticMarkup(<Switch checked={false} aria-label="Deposits" />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(off).toContain('aria-checked="false"');
  });

  it("flips when pressed", () => {
    const onCheckedChange = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<Switch checked={false} aria-label="Deposits" onCheckedChange={onCheckedChange} />));
    act(() => container.querySelector("button")!.click());
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    act(() => root.unmount());
  });
});

describe("SwitchRow", () => {
  it("is one switch named by its label and described by its hint", () => {
    const html = renderToStaticMarkup(
      <SwitchRow
        checked
        label="Take deposits on returnable bottles"
        hint="Each returnable line adds its deposit; empties back take it off."
      />,
    );
    expect(html.match(/role="switch"/g)).toHaveLength(1);
    expect(html).toContain('aria-checked="true"');
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${labelledBy}" class="cx-switch-row__label">Take deposits on returnable bottles<`);
    expect(html).toContain(`id="${describedBy}" class="cx-switch-row__hint">`);
  });
});
