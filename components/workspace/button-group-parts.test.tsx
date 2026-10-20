// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Pager, RecordStepper } from "./button-group-parts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
}
const button = (label: string) => host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

describe("RecordStepper", () => {
  it("disables the end it has no record for and names where this one stands", () => {
    const next = vi.fn();
    mount(<RecordStepper noun="customers" onPrevious={null} onNext={next} position={1} total={38} />);
    expect(button("Previous, K").disabled).toBe(true);
    act(() => button("Next, J").click());
    expect(next).toHaveBeenCalled();
    expect(host!.textContent).toContain("1 of 38");
    expect(host!.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Move between customers");
  });

  it("says nothing of position when it does not know it", () => {
    mount(<RecordStepper noun="sales" onPrevious={() => {}} onNext={() => {}} />);
    expect(host!.textContent).toBe("");
  });
});

describe("Pager", () => {
  it("names both buttons and disables the one with nowhere to go", () => {
    mount(<Pager onPrevious={null} onNext={() => {}} />);
    const names = [...host!.querySelectorAll("button")].map((b) => [b.textContent, b.disabled]);
    expect(names).toEqual([["Previous", true], ["Next", false]]);
  });
});
