"use client";

import { useEffect, useId, useState, useTransition } from "react";
import type { WorkspaceProduct } from "@prisma/client";
import { useRouter } from "next/navigation";

import { WorkspaceMark } from "@/components/admin/workspace-mark";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CaretUpDown, Check, Globe, Search } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { findWorkspacesToOpen } from "./actions";
import styles from "./admin-shell.module.css";

type Found = Awaited<ReturnType<typeof findWorkspacesToOpen>>[number];

/** Anything on the page can open the switcher: the scope bar's "Open a workspace", or `O`. */
export const OPEN_SWITCHER_EVENT = "admin:open-switcher";

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * The context, named at the top of the sidebar, and the way to change it:
 * open a workspace by name, or go back to all workspaces.
 */
export function ContextSwitcher({
  current,
  operatorLine,
}: {
  current: { slug: string; name: string; product: WorkspaceProduct; profile: string | null } | null;
  operatorLine: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "o" || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SWITCHER_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SWITCHER_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    startTransition(async () => {
      const rows = await findWorkspacesToOpen(q);
      if (!stale) {
        setFound(rows);
        // Typing names a workspace, so Enter opens the first match; with
        // nothing typed it goes back to all workspaces.
        setActive(q.trim() && rows.length > 0 ? 1 : 0);
      }
    });
    return () => {
      stale = true;
    };
  }, [open, q]);

  // "All workspaces" is the first choice, then what was found.
  const choices: Array<{ key: string; href: string }> = [
    { key: "all", href: "/admin/workspaces" },
    ...found.map((row) => ({ key: row.slug, href: `/admin/w/${row.slug}` })),
  ];

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(styles.switcher, current && styles.switcherInWorkspace)}
          aria-label={
            current
              ? `Context: ${current.name}. Switch workspace or go back to all workspaces`
              : "Context: all workspaces. Open a workspace"
          }
        >
          {current ? (
            <WorkspaceMark product={current.product} profile={current.profile} />
          ) : (
            <span className={styles.globe} aria-hidden="true">
              <Globe />
            </span>
          )}
          <span className={styles.switcherText}>
            <span className={styles.switcherName}>{current ? current.name : "All workspaces"}</span>
            <span className={styles.switcherSub}>{operatorLine}</span>
          </span>
          <CaretUpDown className={styles.itemIcon} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[19rem] p-1">
        <label className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-[var(--ink-3)] shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[inset_0_0_0_1px_var(--action)]">
          <Search className="size-4 flex-none" />
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, choices.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && choices[active]) {
                event.preventDefault();
                go(choices[active].href);
              }
            }}
            placeholder="Open a workspace"
            aria-label="Open a workspace"
            aria-controls={listId}
            aria-activedescendant={`${listId}-${active}`}
            role="combobox"
            aria-expanded="true"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)]"
          />
          <span className={styles.kbd}>O</span>
        </label>
        <ul id={listId} role="listbox" aria-label="Contexts" className="mt-1 max-h-80 overflow-y-auto">
          {choices.map((choice, index) => {
            const row = found.find((candidate) => candidate.slug === choice.key);
            const isCurrent = row ? row.slug === current?.slug : !current;
            return (
              <li
                key={choice.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(choice.href)}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 text-sm",
                  index === active && "bg-[var(--active)]",
                )}
              >
                {row ? (
                  <WorkspaceMark product={row.product} profile={row.profile} size="sm" />
                ) : (
                  <Globe className="size-4 flex-none text-[var(--ink-3)]" />
                )}
                <span className="min-w-0 flex-1 truncate">{row ? row.name : "All workspaces"}</span>
                {row ? <span className="font-mono text-xs text-[var(--ink-3)]">{row.slug}</span> : null}
                {isCurrent ? <Check className="size-3.5 flex-none text-[var(--ink)]" aria-label="Current" /> : null}
              </li>
            );
          })}
          {q && !pending && found.length === 0 ? (
            <li className="px-2 py-2 text-sm text-[var(--ink-3)]">No workspace is called that.</li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
