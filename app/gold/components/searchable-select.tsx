"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Plus } from "lucide-react";
import type { SearchableOption } from "@/app/gold/types";

export function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  searchPlaceholder,
  onValueChange,
  onAddOption,
  addLabel = "Add new item",
  disabled,
}: {
  label: string;
  value?: string;
  options: SearchableOption[];
  placeholder: string;
  searchPlaceholder?: string;
  onValueChange: (value: string) => void;
  onAddOption?: (query: string) => void;
  addLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const activeOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => {
      const labelMatch = option.label.toLowerCase().includes(normalized);
      const descriptionMatch = option.description?.toLowerCase().includes(normalized);
      const metaMatch = option.meta?.toLowerCase().includes(normalized);
      return labelMatch || descriptionMatch || metaMatch;
    });
  }, [options, query]);

  return (
    <div className="space-y-2" ref={containerRef}>
      <label className="block text-sm font-semibold">{label}</label>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          onClick={() => setOpen((prev) => !prev)}
          disabled={disabled}
        >
          <span className={activeOption ? "text-foreground" : "text-muted-foreground"}>
            {activeOption?.label ?? placeholder}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>

        {open && (
          <div className="absolute z-50 mt-2 w-full rounded-md border border-border bg-popover shadow-lg">
            <div className="border-b border-border p-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder ?? "Search..."}
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  No matching options.
                </div>
              ) : (
                <div className="space-y-1 p-1">
                  {filteredOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="flex w-full flex-col gap-1 rounded-sm px-2 py-2 text-left text-sm transition hover:bg-muted"
                      onClick={() => {
                        onValueChange(option.value);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{option.label}</span>
                        {option.meta ? (
                          <Badge
                            variant={option.badgeVariant ?? "secondary"}
                            className="shrink-0"
                          >
                            {option.meta}
                          </Badge>
                        ) : null}
                      </div>
                      {option.description ? (
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
              <div className="sticky bottom-0 border-t border-border bg-popover p-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    onAddOption?.(query);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {addLabel}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
