// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { binAsk, closeShortAsk, closeUncountedAsk, unpairAsk } from "@/lib/retail/asks";
import type { Ask } from "@/lib/workspace/ask";
import { ConfirmDialog } from "./confirm-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mount(ask: Ask, onConfirm: (value?: string) => Promise<void>) {
  const onOpenChange = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        ask={ask}
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
        onConfirm={onConfirm}
      />
    );
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Harness />));
  return { onOpenChange };
}

const dialog = () => document.querySelector('[role="alertdialog"]');
const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent === text) as HTMLButtonElement;

describe("ConfirmDialog", () => {
  const ask = binAsk({ title: "Castle Lager 340ml", movedAt: new Date("2026-10-03T10:00:00Z") });

  it("is an alertdialog named by its title, described by its body, starting on keep", () => {
    mount(ask, async () => {});
    const node = dialog()!;
    expect(node).not.toBeNull();
    const title = document.getElementById(node.getAttribute("aria-labelledby")!);
    const body = document.getElementById(node.getAttribute("aria-describedby")!);
    expect(title?.textContent).toBe("Move Castle Lager 340ml to the bin?");
    expect(body?.textContent).toContain("You can restore it from the bin until 2 November.");
    expect(document.activeElement?.textContent).toBe("Keep it");
    expect(button("Move to the bin").className).toContain("cx-btn--danger-fill");
  });

  it("fills go with the action colour when the ask is not destructive", () => {
    mount(closeShortAsk({ ref: "PO-0003", unitsToCome: 480, linesToCome: 4, value: 240, supplier: "Delta" }), async () => {});
    expect(button("Close the order").className).toContain("cx-btn--primary");
  });

  it("keeps the dialog open and shows the error when go fails", async () => {
    const { onOpenChange } = mount(ask, () => Promise.reject(new Error("Castle Lager 340ml is on an open order.")));
    await act(async () => button("Move to the bin").click());
    expect(dialog()).not.toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Castle Lager 340ml is on an open order.");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows a spinner while go runs, then closes", async () => {
    let finish: () => void = () => {};
    const { onOpenChange } = mount(ask, () => new Promise<void>((resolve) => (finish = resolve)));
    await act(async () => button("Move to the bin").click());
    expect(button("Move to the bin").getAttribute("aria-busy")).toBe("true");
    expect(button("Keep it").disabled).toBe(true);
    await act(async () => finish());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(dialog()).toBeNull();
  });

  it("keeps on keep", () => {
    const onConfirm = vi.fn(async () => {});
    const { onOpenChange } = mount(ask, onConfirm);
    act(() => button("Keep it").click());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ConfirmDialog with nothing to go ahead with", () => {
  it("offers only keep when the ask has no go (Unpair while a shift is open)", () => {
    mount(unpairAsk("Front till", "CounterMini", "Close Chipo Dube’s shift on Front till first."), vi.fn(async () => {}));
    expect(dialog()?.textContent).toContain("Close Chipo Dube’s shift on Front till first.");
    expect(Array.from(document.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Keep it"]);
  });
});

describe("ConfirmDialog with a field", () => {
  const ask = closeUncountedAsk({ shiftNo: "SH-00240", expectedCash: 72.95 });

  it("asks why, refuses go until it is said, then sends it", async () => {
    const onConfirm = vi.fn(async (value?: string) => void value);
    mount(ask, onConfirm);
    expect(dialog()?.textContent).toContain("the US$72.95 that should be in it stays on the shift");
    const area = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(area.placeholder).toBe("The handheld was lost, for example");
    expect(document.querySelector(`label[for="${area.id}"]`)?.textContent).toBe("Why");
    await act(async () => button("Close without counting").click());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.querySelector(".cx-error")?.textContent).toBe("Say why it was not counted.");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(area, "  The handheld was lost  ");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Close without counting").click());
    expect(onConfirm).toHaveBeenCalledWith("The handheld was lost");
  });
});
