"use client";

import { useState, type KeyboardEvent } from "react";

import type { LucideIcon } from "@/lib/icons";

import styles from "./page-editor.module.css";

/** Something that can be put on the page: a kind of question, a kind of block. */
export type EditorKind = { id: string; label: string; icon: LucideIcon };

/** The kinds whose name starts with, then contains, what was typed after `/`. */
export function matchKinds(kinds: readonly EditorKind[], query: string): EditorKind[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...kinds];
  const starts = kinds.filter((kind) => kind.label.toLowerCase().startsWith(needle));
  const contains = kinds.filter(
    (kind) => !starts.includes(kind) && kind.label.toLowerCase().includes(needle),
  );
  return [...starts, ...contains];
}

/**
 * Arrow keys move, Enter picks, Escape closes — returned as a key handler so
 * the menu is driven from whichever input owns the focus, and the author never
 * leaves the line they are typing on.
 */
export function useKindMenu(options: EditorKind[], onPick: (kind: EditorKind) => void, onClose: () => void) {
  const [active, setActive] = useState(0);
  const index = Math.min(active, Math.max(0, options.length - 1));

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index + 1) % Math.max(1, options.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index - 1 + options.length) % Math.max(1, options.length));
    } else if (event.key === "Enter" && options[index]) {
      event.preventDefault();
      onPick(options[index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return { active: index, setActive, onKeyDown };
}

export function KindMenuList({
  id,
  options,
  active,
  onHover,
  onPick,
}: {
  id: string;
  options: EditorKind[];
  active: number;
  onHover: (index: number) => void;
  onPick: (kind: EditorKind) => void;
}) {
  if (options.length === 0) {
    return <p className={styles.menuEmpty}>Nothing by that name</p>;
  }
  return (
    <ul id={id} role="listbox" className={styles.menuList}>
      {options.map((kind, index) => {
        const Icon = kind.icon;
        return (
          <li
            key={kind.id}
            id={`${id}-${kind.id}`}
            role="option"
            aria-selected={index === active}
            className={styles.menuItem}
            // Pointer only; the keyboard path is the owning input's handler.
            onPointerEnter={() => onHover(index)}
            onPointerDown={(event) => {
              event.preventDefault();
              onPick(kind);
            }}
          >
            <Icon aria-hidden="true" />
            <span>{kind.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
