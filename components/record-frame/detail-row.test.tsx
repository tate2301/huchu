// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { RailRow } from "@/lib/retail/record-kinds/types";

import { gridIndex } from "@/components/ui/date-picker";

import { DetailRow } from "./detail-row";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pays: RailRow = {
  key: "pays",
  label: "Pays",
  value: "30 days",
  edit: { field: "pays", type: "seg", options: ["On delivery", "7 days", "14 days", "30 days"], initial: "30 days", requires: ["retail.suppliers", "update"] },
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function openPays() {
  const onCancel = vi.fn();
  const onSave = vi.fn(async () => {});
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(<DetailRow row={pays} editable editing saved={false} onEdit={() => {}} onCancel={onCancel} onSave={onSave} />),
  );
  const item = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>(".cx-seg__item")].find((button) => button.textContent === label)!;
  return { onCancel, onSave, item };
}

describe("DetailRow seg editor", () => {
  it("opens with focus on the chosen value, so Esc cancels straight away", () => {
    const { onCancel, onSave, item } = openPays();
    expect(document.activeElement).toBe(item("30 days"));
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes without saving when the value already chosen is clicked", () => {
    const { onCancel, onSave, item } = openPays();
    act(() => item("30 days").click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a different pick at once and does not cancel", async () => {
    const { onCancel, onSave, item } = openPays();
    await act(async () => item("7 days").click());
    expect(onSave).toHaveBeenCalledWith(pays.edit, "7 days");
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("DetailRow date editor", () => {
  beforeAll(() => {
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
  });

  const expected: RailRow = {
    key: "expected",
    label: "Expected",
    value: "3 October 2026",
    mono: true,
    edit: { field: "expectedDate", type: "date", initial: "2026-10-03", requires: ["retail.purchasing", "update"] },
  };

  it("opens the picker from the row and saves a picked day at once", async () => {
    const onEdit = vi.fn();
    const onSave = vi.fn(async () => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const draw = (editing: boolean) =>
      act(() =>
        root!.render(
          <DetailRow row={expected} editable editing={editing} saved={false} onEdit={onEdit} onCancel={() => {}} onSave={onSave} />,
        ),
      );
    draw(false);
    act(() => container.querySelector<HTMLButtonElement>(".cx-rf-ev")!.click());
    expect(onEdit).toHaveBeenCalledTimes(1);
    draw(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Expected, as a date");
    const seventh = document.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[gridIndex("2026-10-01", "2026-10-07")]!;
    await act(async () => seventh.click());
    expect(onSave).toHaveBeenCalledWith(expected.edit, "2026-10-07");
  });
});
