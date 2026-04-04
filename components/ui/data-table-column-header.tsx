"use client";

import type { Column } from "@tanstack/react-table";

import { ArrowDownward, ArrowUpward } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
};

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-2 h-8 rounded-[10px] px-2.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-strong)]", className)}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span>{title}</span>
      {sorted === "asc" ? (
        <ArrowUpward className="size-4" />
      ) : sorted === "desc" ? (
        <ArrowDownward className="size-4" />
      ) : null}
    </Button>
  );
}
