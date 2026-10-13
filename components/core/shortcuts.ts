"use client";

import * as React from "react";

/**
 * The kit's keyboard shortcuts (design/core-modules/spec/shortcuts.md).
 *
 * A shortcut is written as it shows in its button: "N", "/", "Esc", "Ctrl K",
 * "Ctrl ↵". Single keys fire only when focus is not in a text box. Ctrl is ⌘
 * on macOS, in the key that fires and in the label that shows. No shortcut
 * fires while a dialog is open unless it was registered from inside one.
 */

export type Shortcut = string;

type Parsed = { mod: boolean; shift: boolean; key: string };

const KEY_NAMES: Record<string, string> = {
  "↵": "Enter",
  Enter: "Enter",
  Esc: "Escape",
  Escape: "Escape",
  Space: " ",
};

export function parseShortcut(shortcut: Shortcut): Parsed {
  const parts = shortcut.trim().split(/\s+/);
  const mod = parts.includes("Ctrl") || parts.includes("⌘");
  const shift = parts.includes("Shift");
  const last = parts[parts.length - 1] ?? "";
  return { mod, shift, key: KEY_NAMES[last] ?? last.toLowerCase() };
}

/** `aria-keyshortcuts` for a shortcut: "Control+K", "N", "Control+Enter". */
export function ariaKeyShortcuts(shortcut: Shortcut): string {
  const { mod, shift, key } = parseShortcut(shortcut);
  const name = key.length === 1 ? key.toUpperCase() : key;
  return [mod ? "Control" : null, shift ? "Shift" : null, name].filter(Boolean).join("+");
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
}

/** Whether a key event is this shortcut. */
export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const { mod, shift, key } = parseShortcut(shortcut);
  const pressedMod = event.ctrlKey || event.metaKey;
  if (mod !== pressedMod || event.altKey) return false;
  if (shift !== event.shiftKey && key.length > 1) return false;
  const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (pressed !== key) return false;
  // A single key (or Esc) never fires while a person is typing, except Esc.
  if (!mod && key !== "Escape" && isTextTarget(event.target)) return false;
  return true;
}

function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !== null;
}

/**
 * Calls `handler` when `shortcut` is pressed. `enabled: false` turns it off;
 * `inDialog` lets a dialog's own shortcuts fire while it is open.
 */
export function useShortcut(
  shortcut: Shortcut | null | undefined,
  handler: (event: KeyboardEvent) => void,
  { enabled = true, inDialog = false }: { enabled?: boolean; inDialog?: boolean } = {},
) {
  const latest = React.useRef(handler);
  React.useEffect(() => {
    latest.current = handler;
  });
  React.useEffect(() => {
    if (!shortcut || !enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (!matchesShortcut(event, shortcut)) return;
      if (!inDialog && dialogOpen()) return;
      event.preventDefault();
      latest.current(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut, enabled, inDialog]);
}

function subscribeNothing() {
  return () => {};
}

/** Whether this device is a Mac, so Ctrl reads as ⌘. False on the server. */
export function useIsMac(): boolean {
  return React.useSyncExternalStore(
    subscribeNothing,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

/** The label a shortcut shows: "Ctrl K", or "⌘ K" on a Mac. */
export function useShortcutLabel(shortcut: Shortcut): string {
  const isMac = useIsMac();
  return isMac ? shortcut.replace(/\bCtrl\b/g, "⌘") : shortcut;
}
