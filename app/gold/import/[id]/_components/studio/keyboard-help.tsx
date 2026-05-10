"use client";

import { useEffect } from "react";
import { X } from "@/lib/icons";
import { cn } from "@/lib/utils";

type ShortcutEntry = { keys: string[]; description: string };
type ShortcutSection = { heading: string; entries: ShortcutEntry[] };

const SECTIONS: ShortcutSection[] = [
  {
    heading: "Navigation",
    entries: [
      { keys: ["↑ / ↓ / ← / →"], description: "Move active cell" },
      { keys: ["Tab / Shift+Tab"], description: "Move across columns" },
      { keys: ["Cmd+Home", "Cmd+End"], description: "Jump to first / last row" },
      { keys: ["j / k (vim)"], description: "Move row down / up" },
      { keys: ["h / l (vim)"], description: "Move cell left / right" },
      { keys: ["gg / G (vim)"], description: "Jump to top / bottom" },
    ],
  },
  {
    heading: "Selection",
    entries: [
      { keys: ["Click"], description: "Select row" },
      { keys: ["Shift+Click"], description: "Range select" },
      { keys: ["Cmd+Click"], description: "Additive select" },
      { keys: ["x (vim)"], description: "Toggle row selection" },
    ],
  },
  {
    heading: "Editing",
    entries: [
      { keys: ["Enter / i"], description: "Enter edit mode" },
      { keys: ["Esc"], description: "Cancel / exit edit mode" },
      { keys: ["Ctrl+Z"], description: "Undo" },
      { keys: ["Ctrl+Shift+Z"], description: "Redo" },
      { keys: ["dd (vim)"], description: "Delete selected rows" },
      { keys: ["yy (vim)"], description: "Copy selected rows" },
      { keys: ["p (vim)"], description: "Paste after active row" },
      { keys: ["Cmd+V"], description: "Paste spreadsheet data" },
    ],
  },
  {
    heading: "Commands",
    entries: [
      { keys: ["Cmd+K", ": (vim)"], description: "Open command palette" },
      { keys: ["? "], description: "Show this help" },
      { keys: ["/ (vim)"], description: "Focus search" },
      { keys: ["Cmd+\\"], description: "Toggle fullscreen" },
      { keys: ["Ctrl+F"], description: "Find / replace" },
    ],
  },
  {
    heading: "Studio actions",
    entries: [
      { keys: ["+"], description: "Add row at end" },
      { keys: ["Ctrl+Enter"], description: "Run dry-run validation" },
    ],
  },
];

export function KeyboardHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-[--border]",
          "bg-[--surface-base] shadow-2xl",
        )}
        style={{ fontFamily: "var(--font-mono, monospace)" }}
      >
        <div className="flex items-center justify-between border-b border-[--border] px-5 py-3">
          <span className="text-sm font-semibold text-[--text-strong]">
            Keyboard shortcuts
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[--text-muted] hover:text-[--text-strong]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid max-h-[70vh] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[--text-muted]">
                {section.heading}
              </h3>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {section.entries.map((entry) => (
                    <tr key={entry.description} className="border-b border-[--border] last:border-0">
                      <td className="py-1.5 pr-4 font-mono text-[--text-strong]">
                        {entry.keys.map((k, i) => (
                          <span key={k}>
                            {i > 0 && <span className="mx-1 text-[--text-muted]">/</span>}
                            <kbd className="rounded border border-[--border] px-1.5 py-px text-[9px]">
                              {k}
                            </kbd>
                          </span>
                        ))}
                      </td>
                      <td className="py-1.5 text-[--text-body]">{entry.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="border-t border-[--border] px-5 py-2 text-[10px] text-[--text-muted]">
          Press <kbd className="rounded border border-[--border] px-1 py-px">?</kbd> or{" "}
          <kbd className="rounded border border-[--border] px-1 py-px">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
