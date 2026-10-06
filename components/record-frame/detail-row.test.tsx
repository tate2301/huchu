// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RailRow } from "@/lib/retail/record-kinds/types";

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
