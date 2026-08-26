"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Search, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import type { CommandGroup, CommandItem } from "./command-bar-types";

/**
 * The command bar: one list, one preview, one keyboard.
 *
 * The old palette was a list of names. That is enough to jump somewhere you
 * already know the name of, and not enough for the thing people actually do —
 * checking whether this Design Standup is the one at eleven before opening it,
 * or seeing who is on a deal before navigating away from what they were doing.
 * So the highlighted row fills a preview pane, and the footer carries that
 * row's two obvious actions rather than a generic "select".
 *
 * The preview is not decoration: it is what makes the bar answerable without
 * navigation, which is the difference between a launcher and a way to work.
 */

const DOT_CLASS = {
  success: "bg-[var(--status-success-border)]",
  warn: "bg-[var(--status-warning-border)]",
  danger: "bg-[var(--status-error-border)]",
} as const;

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] px-1 font-sans text-sm text-[var(--text-muted)]">
      {children}
    </kbd>
  );
}

function CommandRow({
  item,
  active,
  onHover,
  onRun,
}: {
  item: CommandItem;
  active: boolean;
  onHover: () => void;
  onRun: () => void;
}) {
  const Icon = item.icon;

  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onMouseMove={onHover}
        onClick={onRun}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors",
          active
            ? "bg-[var(--surface-subtle)] shadow-[var(--shadow-xs)]"
            : "hover:bg-[var(--surface-subtle)]",
        )}
      >
        {item.mark ?? (
          Icon ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--text-muted)]">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          ) : (
            <span className="size-7 shrink-0" />
          )
        )}

        <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>

        {item.hint ? (
          <span className="shrink-0 truncate text-sm text-[var(--text-muted)]">
            {item.hint}
          </span>
        ) : null}

        {item.dot ? (
          <span className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[item.dot])} />
        ) : null}
      </button>
    </li>
  );
}

export function CommandBar({
  open,
  onOpenChange,
  query,
  onQueryChange,
  groups,
  placeholder = "Search quick actions",
  emptyMessage = "Nothing matches that.",
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (value: string) => void;
  groups: CommandGroup[];
  placeholder?: string;
  emptyMessage?: string;
  loading?: boolean;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus the field on every opening, not just the first mount. `autoFocus`
  // alone fires when React mounts the node, which loses the race against the
  // click that opened the bar — the dialog appeared and the caret stayed in
  // whatever the pointer had just left. A layout effect runs before paint, so
  // the caret is in the field by the time the bar is visible.
  React.useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const flat = React.useMemo(() => groups.flatMap((group) => group.items), [groups]);

  // Keep a selection at all times, and move it to the top whenever the list
  // changes underneath — a highlight left on a row that no longer exists is a
  // bar where Enter does something you did not read.
  const activeIndex = flat.findIndex((item) => item.id === activeId);
  const active = activeIndex === -1 ? flat[0] : flat[activeIndex];
  if (flat.length > 0 && activeIndex === -1 && activeId !== flat[0].id) {
    setActiveId(flat[0].id);
  }

  const move = React.useCallback(
    (delta: 1 | -1) => {
      if (flat.length === 0) return;
      const current = flat.findIndex((item) => item.id === activeId);
      const next = (current + delta + flat.length) % flat.length;
      setActiveId(flat[next].id);

      // Keep the highlight in view without scrolling the page behind it.
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector('[aria-selected="true"]')
          ?.scrollIntoView({ block: "nearest" });
      });
    },
    [activeId, flat],
  );

  const run = React.useCallback(
    (item: CommandItem | undefined) => {
      if (!item?.primary) return;
      onOpenChange(false);
      item.primary.run();
    },
    [onOpenChange],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        run(active);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, move, onOpenChange, open, router, run]);

  if (!open) return null;

  const preview = active?.preview ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(15,23,42,0.35)] p-4 pt-[12vh]"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick actions"
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--elevation-4,var(--shadow-popover))]",
          preview ? "max-w-3xl" : "max-w-md",
        )}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3">
          <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0">
          <div
            ref={listRef}
            role="listbox"
            aria-label="Results"
            className={cn(
              "max-h-[26rem] min-h-0 flex-1 overflow-y-auto p-2",
              preview ? "border-r border-[var(--border-subtle)]" : "",
            )}
          >
            {flat.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-[var(--text-muted)]">
                {loading ? "Searching…" : emptyMessage}
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.id} className="pb-1">
                  <h3 className="px-2.5 pb-1 pt-2 text-sm font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                    {group.label}
                  </h3>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <CommandRow
                        key={item.id}
                        item={item}
                        active={item.id === active?.id}
                        onHover={() => setActiveId(item.id)}
                        onRun={() => run(item)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          {preview ? (
            <div className="hidden min-h-0 w-80 shrink-0 flex-col sm:flex">{preview}</div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
            <Key>↓</Key>
            <Key>↑</Key>
            Navigate
          </span>

          <span className="flex-1" />

          {active?.secondary ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                active.secondary?.run();
              }}
            >
              {active.secondary.label}
            </Button>
          ) : null}

          {active?.primary ? (
            <Button type="button" size="sm" onClick={() => run(active)}>
              {active.primary.label}
              <span className="ml-1.5 opacity-70" aria-hidden="true">
                ⏎
              </span>
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
              <Key>⏎</Key>
              Select
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
