"use client";

import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { Columns } from "@/lib/icons";
import type { ListColumn } from "@/lib/reports/types";

/**
 * Columns (00-foundations 5.4.4 item 6): a checkbox per column — the first,
 * the row's name, is not hideable — and "Show all" at the foot. What is
 * hidden is remembered per person per list.
 */
export function ColumnsMenuContent({
  columns,
  hidden,
  onHidden,
}: {
  columns: ListColumn[];
  hidden: string[];
  onHidden: (hidden: string[]) => void;
}) {
  return (
    <>
      {columns.slice(1).map((column) => {
        const shown = !hidden.includes(column.key);
        return (
          <MenuCheckboxItem
            key={column.key}
            checked={shown}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onHidden(checked ? hidden.filter((key) => key !== column.key) : [...hidden, column.key])
            }
          >
            {column.label}
          </MenuCheckboxItem>
        );
      })}
      <MenuSeparator />
      <MenuItem disabled={hidden.length === 0} onSelect={() => onHidden([])}>
        Show all
      </MenuItem>
    </>
  );
}

export function ColumnsMenu(props: { columns: ListColumn[]; hidden: string[]; onHidden: (hidden: string[]) => void }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="cx-lf-btn cx-lf-btn--quiet">
          <Columns aria-hidden />
          Columns
        </button>
      </MenuTrigger>
      <MenuContent align="end" style={{ minWidth: 200 }}>
        <ColumnsMenuContent {...props} />
      </MenuContent>
    </Menu>
  );
}
