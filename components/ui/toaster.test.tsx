// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast as dsToast } from "@corelithzw/react";

import { Toaster } from "./toaster";
import { toast } from "./use-toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => dsToast.dismiss());
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Toaster />));
}

describe("Toaster", () => {
  it("shows one toast at a time: a new one replaces the old", () => {
    mount();
    act(() => {
      toast({ title: "Afdis Distillers added.", variant: "success" });
    });
    act(() => {
      toast({ title: "SH-00243 open on the back till for Kuda Banda.", variant: "success" });
    });
    const shown = document.querySelectorAll(".cx-toast");
    expect(shown).toHaveLength(1);
    expect(shown[0].getAttribute("role")).toBe("status");
    expect(shown[0].textContent).toBe("SH-00243 open on the back till for Kuda Banda.");
    expect(shown[0].querySelector(".cx-toast__icon--ok")).not.toBeNull();
  });

  it("marks a partial result with the warn triangle and a failure as an alert", () => {
    mount();
    act(() => {
      toast({ title: "2 of 3 Z-reports printed.", variant: "warning" });
    });
    expect(document.querySelector(".cx-toast__icon--warn")).not.toBeNull();
    act(() => {
      toast({ title: "Nothing was changed", variant: "destructive" });
    });
    expect(document.querySelector(".cx-toast")?.getAttribute("role")).toBe("alert");
  });

  it("offers its action as a button and goes away after 5 seconds", () => {
    vi.useFakeTimers();
    mount();
    const onClick = vi.fn();
    act(() => {
      toast({ title: "Castle Lager 340ml moved to the bin.", action: { label: "Undo", onClick } });
    });
    const action = document.querySelector<HTMLButtonElement>(".cx-toast__action");
    expect(action?.textContent).toBe("Undo");
    act(() => vi.advanceTimersByTime(4900));
    expect(document.querySelector(".cx-toast")).not.toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(document.querySelector(".cx-toast")).toBeNull();
  });
});
