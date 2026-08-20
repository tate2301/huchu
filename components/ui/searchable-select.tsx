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
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { CheckIcon, ChevronDown, Plus } from "@/lib/icons";

/**
 * SearchableSelect — a Radix Popover wrapped around the local Command list.
 *
 * 28 files import this. The DS's own picker is a single component over an
 * options array with no search slot, no "add new" affordance and no per-option
 * avatar/badge/description, so the composition stays and only the styling
 * moves: the wrapper is the DS `.field` stack, the label is `.field-label`, and
 * every colour is a token. The dropdown itself inherits the DS `.menu` chrome
 * through `components/ui/command.tsx`.
 *
 * `value` may be `""` or `undefined`; both mean "nothing selected" and both
 * fall through `options.find` to `undefined`.
 */
export type SearchableOption = {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  avatarUrl?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  disabled?: boolean;
  disabledReason?: string;
};

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
  label?: string;
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
      const disabledReasonMatch = option.disabledReason?.toLowerCase().includes(normalized);
      return labelMatch || descriptionMatch || metaMatch || disabledReasonMatch;
    });
  }, [options, query]);

  return (
    <div className="field">
      {label ? <label className="field-label">{label}</label> : null}
      <ResponsivePopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
          }
        }}
        title={label ?? placeholder}
        className="w-[var(--radix-popover-trigger-width)] p-0"
        trigger={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
          >
            <span
              className={
                activeOption
                  ? "truncate text-[var(--text-strong)]"
                  : "truncate text-[var(--text-subtle)]"
              }
            >
              {activeOption?.label ?? placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          </Button>
        }
      >
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
                      disabled={option.disabled}
                      onMouseDown={(event) => event.preventDefault()}
                      onSelect={() => {
                        if (option.disabled) return;
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
                          <span className="truncate text-[var(--text-strong)] [font:var(--type-label-sm)]">
                            {option.label}
                          </span>
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
                          <div className="truncate text-[var(--text-muted)] [font:var(--type-caption)]">
                            {option.description}
                          </div>
                        ) : null}
                        {option.disabledReason ? (
                          <div className="truncate text-[var(--tone-danger)] [font:var(--type-caption)]">
                            {option.disabledReason}
                          </div>
                        ) : null}
                      </div>
                      {value === option.value ? (
                        <CheckIcon className="h-4 w-4 shrink-0 text-[var(--brand)]" />
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
      </ResponsivePopover>
    </div>
  );
}
