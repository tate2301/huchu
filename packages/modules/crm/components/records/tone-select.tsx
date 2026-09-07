"use client";

import { useMemo, useState, type ReactNode } from "react";

import { Switch } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@corelithzw/ui/components/popover";
import { ChevronDown, Search } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

export type ToneOption = {
  value: string;
  label: string;
  /** A Tailwind background class for the dot. See `lib/crm/tones.ts`. */
  dot?: string;
  /** Shown instead of a dot — an entity's own mark, say. */
  icon?: ReactNode;
};

/**
 * The picker for any typed set: stages, statuses, entities, anything whose
 * members are a fixed list rather than free text.
 *
 * Two things it does that a plain select does not.
 *
 * A colour per option, carried through to the trigger. In a list of eight
 * stages the reader is telling them apart, not judging them, and by the time
 * they have read "Site visit" they have already found it by its hue. The
 * trigger shows the chosen options' dots so a collapsed multi-select still
 * says roughly what is in it.
 *
 * A switch per row rather than a checkbox, and a search box once the list is
 * long enough to hunt through. A checkbox list asks you to aim at a small
 * square; a row that toggles wherever you hit it does not.
 */
export function ToneSelect({
  options,
  selected,
  onChange,
  /** Single-select collapses to one value and closes on pick. */
  multiple = true,
  label,
  placeholder = "Anything",
  searchThreshold = 6,
  className,
  align = "start",
}: {
  options: ToneOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  label?: string;
  placeholder?: string;
  /** Below this many options, searching is more work than reading. */
  searchThreshold?: number;
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const chosen = useMemo(
    () => options.filter((option) => selected.includes(option.value)),
    [options, selected],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  const allSelected = options.length > 0 && selected.length === options.length;

  const toggle = (value: string) => {
    if (!multiple) {
      onChange([value]);
      setOpen(false);
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          // `shrink-0` because the toolbar would otherwise squeeze this below
          // its own content. The height and the gap come from the button, not
          // from here: this used to carry `size="sm" h-9`, which is asking for
          // a 30px control and then forcing 36px back onto it — the habit that
          // left three different heights in one row.
          className={cn("shrink-0 justify-between whitespace-nowrap", className)}
          aria-label={label}
        >
          <span className="flex min-w-0 items-center gap-2">
            {/* A multi-select trigger says WHICH question it answers, and
                shows the choice as dots. Spelling out every chosen stage
                turns a 9-item pick into a sentence that wraps the button. */}
            <span className="whitespace-nowrap">
              {multiple ? (label ?? placeholder) : (chosen[0]?.label ?? placeholder)}
            </span>
            {multiple && chosen.length > 0 ? (
              <span className="flex flex-none items-center -space-x-1">
                {chosen.slice(0, 6).map((option) =>
                  option.icon ? (
                    <span key={option.value} className="flex size-3.5 items-center">
                      {option.icon}
                    </span>
                  ) : (
                    <span
                      key={option.value}
                      aria-hidden="true"
                      className={cn(
                        "size-2.5 rounded-full ring-2 ring-[var(--surface)]",
                        option.dot ?? "bg-[var(--text-subtle)]",
                      )}
                    />
                  ),
                )}
              </span>
            ) : null}
          </span>
          <ChevronDown className="size-3 flex-none text-[var(--text-muted)]" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align={align} className="w-72 p-0">
        {options.length >= searchThreshold ? (
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] p-2">
            <Search className="size-4 flex-none text-[var(--text-subtle)]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              aria-label={`Search ${label ?? "options"}`}
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
            />
            {multiple ? (
              <button
                type="button"
                onClick={() =>
                  onChange(allSelected ? [] : options.map((option) => option.value))
                }
                className="flex-none rounded px-1.5 py-1 text-sm text-[var(--interactive-primary)] hover:bg-[var(--surface-muted)]"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="max-h-72 overflow-y-auto p-1">
          {visible.map((option) => {
            const isOn = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"
              >
                {option.icon ?? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 flex-none rounded-full",
                      option.dot ?? "bg-[var(--text-subtle)]",
                    )}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {multiple ? (
                  <Switch
                    checked={isOn}
                    // The row owns the click; the switch is the state made
                    // visible, not a second target to aim at.
                    tabIndex={-1}
                    readOnly
                    className="pointer-events-none"
                  />
                ) : isOn ? (
                  <span className="text-sm text-[var(--interactive-primary)]">Selected</span>
                ) : null}
              </button>
            );
          })}

          {visible.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-[var(--text-muted)]">
              Nothing matches that.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
