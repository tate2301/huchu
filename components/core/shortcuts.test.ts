// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { ariaKeyShortcuts, matchesShortcut, parseShortcut } from "./shortcuts";

function key(init: KeyboardEventInit & { target?: EventTarget | null }) {
  const event = new KeyboardEvent("keydown", init);
  if (init.target !== undefined) Object.defineProperty(event, "target", { value: init.target });
  return event;
}

describe("shortcuts", () => {
  it("reads a shortcut as it shows in its button", () => {
    expect(parseShortcut("N")).toEqual({ mod: false, shift: false, key: "n" });
    expect(parseShortcut("Ctrl K")).toEqual({ mod: true, shift: false, key: "k" });
    expect(parseShortcut("Ctrl ↵")).toEqual({ mod: true, shift: false, key: "Enter" });
    expect(parseShortcut("Esc")).toEqual({ mod: false, shift: false, key: "Escape" });
  });

  it("names it for aria-keyshortcuts", () => {
    expect(ariaKeyShortcuts("N")).toBe("N");
    expect(ariaKeyShortcuts("Ctrl K")).toBe("Control+K");
    expect(ariaKeyShortcuts("Ctrl ↵")).toBe("Control+Enter");
  });

  it("answers Ctrl or ⌘ for Ctrl", () => {
    expect(matchesShortcut(key({ key: "k", ctrlKey: true }), "Ctrl K")).toBe(true);
    expect(matchesShortcut(key({ key: "k", metaKey: true }), "Ctrl K")).toBe(true);
    expect(matchesShortcut(key({ key: "k" }), "Ctrl K")).toBe(false);
    expect(matchesShortcut(key({ key: "n", ctrlKey: true }), "N")).toBe(false);
  });

  it("never fires a single key while a person types, but Esc and Ctrl keys do", () => {
    const input = document.createElement("input");
    expect(matchesShortcut(key({ key: "n", target: input }), "N")).toBe(false);
    expect(matchesShortcut(key({ key: "Escape", target: input }), "Esc")).toBe(true);
    expect(matchesShortcut(key({ key: "Enter", ctrlKey: true, target: input }), "Ctrl ↵")).toBe(true);
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(matchesShortcut(key({ key: "n", target: box }), "N")).toBe(true);
  });
});
