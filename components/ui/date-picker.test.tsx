// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Calendar } from "@corelithzw/react";

import { DatePicker, DateRangePicker, gridIndex, type DayRange } from "./date-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function key(target: Element, name: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });
}

const cells = () => [...document.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')];
/** The cell for a day of October 2026 on that month's page. */
const october = (date: number) => cells()[gridIndex("2026-10-01", `2026-10-${String(date).padStart(2, "0")}`)]!;
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label)!;
/** The From (0) or To (1) field of the range picker. */
const rangeField = (index: 0 | 1) => document.querySelectorAll<HTMLInputElement>(".dp-end input")[index]!;
const field = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

describe("the DS grid mapping", () => {
  it("puts 1 October 2026, a Thursday, at cell 3 of the Monday-first grid", () => {
    mount(<Calendar month={new Date(2026, 9, 1)} value={null} />);
    expect(cells()).toHaveLength(42);
    expect(gridIndex("2026-10-01", "2026-10-01")).toBe(3);
    expect(cells()[3]!.textContent).toBe("1");
    expect(cells()[2]!.textContent).toBe("30");
  });
});

function openDay(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn();
  const host = mount(<DatePicker label="Expected" value="2026-10-03" onChange={onChange} {...props} />);
  act(() => host.querySelector<HTMLButtonElement>("button")!.click());
  return { onChange, host };
}

describe("DatePicker", () => {
  it("opens with the typed field focused and applies a typed day on Enter", () => {
    const { onChange } = openDay();
    const input = field("Expected, as a date");
    expect(document.activeElement).toBe(input);
    type(input, "3 Oct 2026");
    key(input, "Enter");
    expect(onChange).toHaveBeenCalledWith("2026-10-03");
  });

  it("says how to write a day it cannot read, and sends nothing", () => {
    const { onChange } = openDay();
    const input = field("Expected, as a date");
    type(input, "31 Feb 2026");
    key(input, "Enter");
    expect(document.body.textContent).toContain("Write a date, like 7 October 2026.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables days after latest and refuses one typed", () => {
    const { onChange } = openDay({ latest: "2026-10-06" });
    expect(october(7).disabled).toBe(true);
    expect(october(6).disabled).toBe(false);
    const input = field("Expected, as a date");
    type(input, "7 Oct 2026");
    key(input, "Enter");
    expect(document.body.textContent).toContain("Choose a day up to 6 October 2026.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves focus with the arrow keys and rolls the month past its end", () => {
    openDay({ value: "2026-10-30" });
    act(() => october(30).focus());
    key(document.activeElement!, "ArrowRight");
    expect(document.activeElement!.textContent).toBe("31");
    key(document.activeElement!, "ArrowLeft");
    key(document.activeElement!, "ArrowUp");
    expect(document.activeElement!.textContent).toBe("23");
    key(document.activeElement!, "ArrowDown");
    key(document.activeElement!, "ArrowRight");
    key(document.activeElement!, "ArrowRight");
    // 1 November: the grid now shows November and the 1st holds focus.
    expect(document.body.textContent).toContain("November 2026");
    expect(document.activeElement!.textContent).toBe("1");
    expect(document.activeElement!.getAttribute("role")).toBe("gridcell");
  });

  it("picks a day with the grid and closes", () => {
    const { onChange } = openDay();
    act(() => october(9).click());
    expect(onChange).toHaveBeenCalledWith("2026-10-09");
    expect(cells()).toHaveLength(0);
  });

  it("closes on Escape and gives focus back to the trigger", async () => {
    const { host } = openDay();
    key(field("Expected, as a date"), "Escape");
    expect(cells()).toHaveLength(0);
    // Radix hands focus back a tick after the content unmounts.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.activeElement).toBe(host.querySelector("button"));
  });

  it("sends null from Clear when clearable", () => {
    const { onChange } = openDay({ clearable: true, value: "2026-10-03" });
    act(() => button("Clear").click());
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("draws no Clear while there is nothing to clear", () => {
    openDay({ clearable: true, value: null });
    expect(button("Clear")).toBeUndefined();
  });

  it("takes a day and a time", () => {
    const { onChange } = openDay({ time: true, value: null });
    type(field("Expected, as a date"), "3 Oct 2026");
    const clock = document.querySelector<HTMLInputElement>('input[placeholder="09:00"]')!;
    type(clock, "14:30");
    act(() => button("Apply").click());
    expect(onChange).toHaveBeenCalledWith("2026-10-03T14:30");
  });
});

function openRange(props: Partial<React.ComponentProps<typeof DateRangePicker>> = {}, value: DayRange = { from: null, to: null }) {
  const onChange = vi.fn();
  mount(
    <DateRangePicker
      value={value}
      onChange={onChange}
      latest={null}
      trigger={<button type="button">When</button>}
      {...props}
    />,
  );
  act(() => button("When").click());
  return { onChange };
}

describe("DateRangePicker", () => {
  it("takes two clicks in either order, marks the range, and applies it", () => {
    const { onChange } = openRange({}, { from: null, to: "2026-10-20" });
    act(() => october(3).click());
    act(() => october(1).click());
    expect(october(1).dataset.range).toBe("end");
    expect(october(2).dataset.range).toBe("in");
    expect(october(3).dataset.range).toBe("end");
    expect(october(4).dataset.range).toBeUndefined();
    expect(document.body.textContent).toContain("3 days");
    act(() => button("Apply").click());
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-03" });
  });

  it("starts over at From on a third click", () => {
    openRange({}, { from: "2026-10-01", to: "2026-10-03" });
    act(() => october(10).click());
    act(() => october(12).click());
    act(() => october(5).click());
    expect(october(5).dataset.range).toBe("end");
    expect(october(12).dataset.range).toBeUndefined();
    expect(button("Apply").disabled).toBe(true);
  });

  it("fires a preset at once and closes", () => {
    const { onChange } = openRange({
      presets: [{ key: "x", label: "First week", range: () => ({ from: "2026-10-01", to: "2026-10-07" }) }],
    });
    act(() => button("First week").click());
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-07" });
    expect(cells()).toHaveLength(0);
  });

  it("refuses a range longer than maxDays", () => {
    openRange({ maxDays: 366 });
    type(rangeField(0), "1 Jan 2025");
    type(rangeField(1), "5 Feb 2026");
    expect(document.body.textContent).toContain("Choose dates no more than a year apart");
    expect(button("Apply").disabled).toBe(true);
  });

  it("shows a neutral placeholder, not a date that could be mistaken for a choice", () => {
    openRange();
    expect(rangeField(0).placeholder).toBe("Day");
    expect(rangeField(1).placeholder).toBe("Day");
  });

  it("keeps the month buttons out of the Tab order", () => {
    openRange();
    const months = document.querySelectorAll<HTMLButtonElement>('button[aria-label$=" month"]');
    expect(months).toHaveLength(2);
    for (const month of months) expect(month.tabIndex).toBe(-1);
  });

  it("needs both ends unless open-ended", () => {
    openRange();
    type(rangeField(0), "1 Oct 2026");
    expect(button("Apply").disabled).toBe(true);
  });

  it("lets From alone apply when open-ended", () => {
    const { onChange } = openRange({ openEnded: true });
    type(rangeField(0), "1 Oct 2026");
    act(() => button("Apply").click());
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-01", to: null });
  });

  it("hands the next click to To once From is typed in full", () => {
    const { onChange } = openRange();
    const from = rangeField(0);
    expect(document.activeElement).toBe(from);
    type(from, "1 Oct 2026");
    act(() => october(3).click());
    expect(october(2).dataset.range).toBe("in");
    act(() => button("Apply").click());
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-03" });
  });
});
