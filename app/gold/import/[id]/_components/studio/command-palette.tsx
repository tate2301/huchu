"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type CommandVerb = {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  disabled?: boolean;
  onRun: () => void;
};

const RECENT_KEY = "studio-recent-commands";
const MAX_RECENT = 5;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(id: string) {
  const prev = loadRecent().filter((r) => r !== id);
  localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...prev].slice(0, MAX_RECENT)));
}

export function CommandPalette({
  open,
  onOpenChange,
  verbs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verbs: CommandVerb[];
}) {
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setRecent(loadRecent());
    }
  }, [open]);

  const run = useCallback(
    (verb: CommandVerb) => {
      if (verb.disabled) return;
      saveRecent(verb.id);
      setRecent(loadRecent());
      onOpenChange(false);
      verb.onRun();
    },
    [onOpenChange],
  );

  const groups = Array.from(new Set(verbs.map((v) => v.group)));
  const recentVerbs = recent
    .map((id) => verbs.find((v) => v.id === id))
    .filter(Boolean) as CommandVerb[];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-[--border]",
          "bg-[--surface-base] shadow-2xl",
        )}
        style={{ fontFamily: "var(--font-mono, monospace)" }}
      >
        <Command shouldFilter>
          <CommandInput
            placeholder="Search commands…"
            value={search}
            onValueChange={setSearch}
            autoFocus
          />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No commands match.</CommandEmpty>

            {recentVerbs.length > 0 && !search && (
              <>
                <CommandGroup heading={<GroupHeading>Recent</GroupHeading>}>
                  {recentVerbs.map((verb) => (
                    <VerbItem key={verb.id} verb={verb} onRun={run} />
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {groups.map((group) => {
              const items = verbs.filter((v) => v.group === group);
              return (
                <CommandGroup
                  key={group}
                  heading={<GroupHeading>{group}</GroupHeading>}
                >
                  {items.map((verb) => (
                    <VerbItem key={verb.id} verb={verb} onRun={run} />
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
          <div className="flex items-center gap-3 border-t border-[--border] px-3 py-2 text-[10px] text-[--text-muted]">
            <span><kbd className="rounded border border-[--border] px-1 py-px">↑↓</kbd> navigate</span>
            <span><kbd className="rounded border border-[--border] px-1 py-px">↵</kbd> run</span>
            <span><kbd className="rounded border border-[--border] px-1 py-px">Esc</kbd> close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 text-[10px] font-semibold uppercase tracking-widest text-[--text-muted]">
      {children}
    </span>
  );
}

function VerbItem({
  verb,
  onRun,
}: {
  verb: CommandVerb;
  onRun: (v: CommandVerb) => void;
}) {
  return (
    <CommandItem
      value={verb.label}
      disabled={verb.disabled}
      onSelect={() => onRun(verb)}
      className="flex items-center justify-between gap-2 text-xs"
    >
      <span className={verb.disabled ? "text-[--text-subtle]" : "text-[--text-body]"}>
        {verb.label}
      </span>
      {verb.shortcut && (
        <kbd className="shrink-0 rounded border border-[--border] px-1.5 py-px text-[9px] text-[--text-muted]">
          {verb.shortcut}
        </kbd>
      )}
    </CommandItem>
  );
}
