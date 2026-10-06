// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { gridIndex } from "@/components/ui/date-picker";

import { FilterChipMenu } from "./filters-popover";
import type { DrawnFilter } from "./model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Radix menus scroll the highlighted item into view.
  Element.prototype.scrollIntoView = () => {};
});

afterAll(() => {
  vi.useRealTimers();
});

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const when: DrawnFilter = { key: "when", label: "When", type: "period", any: "Any time", column: "day", primary: true };

/** The chip with its value held the way the list holds it: in the URL, here in state. */
function Harness({ onPick }: { onPick: (value: string) => void }) {
  const [value, setValue] = React.useState("30d");
  return (
    <FilterChipMenu
      filter={when}
      value={value}
      onPick={(next) => {
        onPick(next);
        setValue(next);
      }}
    />
  );
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLElement>("button, [role=menuitem], [role=menuitemradio]")].find(
    (b) => b.textContent?.trim() === label,
  )!;

describe("a period filter's Choose dates…", () => {
  it("opens the range picker under the chip, and Apply writes the range the chip then reads", async () => {
    const onPick = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Harness onPick={onPick} />));

    const chip = host.querySelector<HTMLButtonElement>(".cx-filter")!;
    expect(chip.getAttribute("aria-label")).toBe("When: Last 30 days");
    act(() => {
      chip.focus();
      chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    act(() => button("Choose dates…").click());
    // The menu has gone and the picker holds the focus in From.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    const from = document.querySelector<HTMLInputElement>('.dp-end input')!;
    expect(document.activeElement).toBe(from);
    expect(document.body.textContent).not.toContain("Last 7 days");

    const cells = () => document.querySelectorAll<HTMLButtonElement>('[role="gridcell"]');
    act(() => cells()[gridIndex("2026-10-01", "2026-10-01")]!.click());
    act(() => cells()[gridIndex("2026-10-01", "2026-10-03")]!.click());
    act(() => button("Apply").click());

    expect(onPick).toHaveBeenCalledWith("2026-10-01..2026-10-03");
    expect(chip.getAttribute("aria-label")).toBe("When: 1 to 3 October");
  });
});
