"use client";

import { useMemo, useState } from "react";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckIcon, ChevronDown, Plus } from "@/lib/icons";
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
  const activeOption = options.find((option) => option.value === value);

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
    <div className="space-y-2">
      <label className="block text-sm font-semibold">{label}</label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className={activeOption ? "text-foreground" : "text-muted-foreground"}>
              {activeOption?.label ?? placeholder}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder ?? "Search..."}
            />
            <CommandList>
              {filteredOptions.length === 0 ? (
                <CommandEmpty>No matching options.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filteredOptions.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.description ?? ""} ${option.meta ?? ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onSelect={() => {
                        onValueChange(option.value);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {option.avatarUrl ? (
                        <EmployeeAvatar
                          name={option.label}
                          photoUrl={option.avatarUrl}
                          size="sm"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{option.label}</span>
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
                          <div className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        ) : null}
                      </div>
                      {value === option.value ? (
                        <CheckIcon className="h-4 w-4 text-primary" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {onAddOption ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value={addLabel}
                      onMouseDown={(event) => event.preventDefault()}
                      onSelect={() => {
                        onAddOption(query);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      {addLabel}
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
