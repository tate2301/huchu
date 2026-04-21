"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, Plus, X } from "@/lib/icons";

export type FilterRule = {
  id: string;
  field: string;
  operator: string;
  value: string;
};

const FIELD_OPTIONS: Record<string, string[]> = {
  "Date": ["after", "before", "between"],
  "Status": ["is", "is not"],
  "Type": ["is", "is not"],
  "Amount": ["greater than", "less than", "equals"],
  "Site": ["is", "is not", "contains"],
  "Supplier": ["is", "contains"],
  "Customer": ["is", "contains"],
  "Category": ["is", "is not"],
};

const DEFAULT_FIELDS = Object.keys(FIELD_OPTIONS);

export function ReportFilterBar({
  onExport,
  className,
}: {
  onExport?: () => void;
  className?: string;
}) {
  const [filters, setFilters] = useState<FilterRule[]>([]);

  const addFilter = () => {
    const id = crypto.randomUUID();
    setFilters((prev) => [
      ...prev,
      { id, field: "Date", operator: "after", value: "" },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<FilterRule>) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => setFilters([]);

  return (
    <div className={cn("rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4", className)}>
      {/* Filter rows */}
      <div className="space-y-2">
        {filters.map((filter, index) => {
          const operators = FIELD_OPTIONS[filter.field] ?? ["is"];
          return (
            <div key={filter.id} className="flex flex-wrap items-center gap-2">
              <span className="w-10 text-xs font-medium text-[var(--text-muted)]">
                {index === 0 ? "Where" : "And"}
              </span>
              <Select
                value={filter.field}
                onValueChange={(v) =>
                  updateFilter(filter.id, {
                    field: v,
                    operator: FIELD_OPTIONS[v]?.[0] ?? "is",
                  })
                }
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filter.operator}
                onValueChange={(v) =>
                  updateFilter(filter.id, { operator: v })
                }
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filter.field === "Date" ? (
                <Input
                  type="date"
                  value={filter.value}
                  onChange={(e) =>
                    updateFilter(filter.id, { value: e.target.value })
                  }
                  className="h-8 w-40 text-xs"
                />
              ) : (
                <Input
                  value={filter.value}
                  onChange={(e) =>
                    updateFilter(filter.id, { value: e.target.value })
                  }
                  placeholder="Value"
                  className="h-8 w-48 text-xs"
                />
              )}
              <button
                type="button"
                onClick={() => removeFilter(filter.id)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Actions row */}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={addFilter}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--edge-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--edge-strong)] hover:text-[var(--text-strong)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add filter
        </button>
        <div className="flex items-center gap-2">
          {filters.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
            >
              Clear all filters
            </button>
          ) : null}
          {onExport ? (
            <Button size="sm" variant="outline" onClick={onExport} className="h-8 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
