"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/workspace/menu";
import { ChevronRight, SlidersHorizontal, SortAscending, TextAlignLeft } from "@/lib/icons";
import type { ListColumn, ListSpecPublic } from "@/lib/reports/types";

import { ColumnsMenu, ColumnsMenuContent } from "./columns-menu";
import { sortLabel } from "./model";

/**
 * How the rows are shown (00-foundations 5.4.4 item 6): Sort, Group and
 * Columns as one button group, or — at 1060px of toolbar and less — one View
 * button holding the three.
 */

type ViewProps = {
  spec: ListSpecPublic;
  sort: string;
  group: string | null;
  hidden: string[];
  /** Columns the page already says (`impliedBy`): not drawn, so not offered under Columns. */
  implied?: readonly string[];
  onSort: (sort: string) => void;
  onGroup: (group: string | null) => void;
  onHidden: (hidden: string[]) => void;
};

function groupLabel(spec: ListSpecPublic, group: string | null): string {
  if (!group) return "None";
  return spec.columns.find((column) => column.key === group)?.label ?? "None";
}

function SortOptions({ spec, sort, onSort }: Pick<ViewProps, "spec" | "sort" | "onSort">) {
  return (
    <MenuRadioGroup value={sort} onValueChange={onSort}>
      {spec.sorts.map((option) => (
        <MenuRadioItem key={option.key} value={option.key}>
          {option.label}
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  );
}

function GroupOptions({ spec, group, onGroup }: Pick<ViewProps, "spec" | "group" | "onGroup">) {
  const groups = (spec.groups ?? [])
    .map((key) => spec.columns.find((column) => column.key === key))
    .filter((column): column is ListColumn => Boolean(column));
  return (
    <MenuRadioGroup value={group ?? "none"} onValueChange={(value) => onGroup(value === "none" ? null : value)}>
      <MenuRadioItem value="none">None</MenuRadioItem>
      {groups.map((column) => (
        <MenuRadioItem key={column.key} value={column.key}>
          {column.label}
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  );
}

export function ViewControls(props: ViewProps & { folded: boolean }) {
  const { spec, sort, group, folded } = props;
  const canGroup = (spec.groups ?? []).length > 0;
  const columns = props.implied?.length ? spec.columns.filter((column) => !props.implied!.includes(column.key)) : spec.columns;

  if (folded) {
    return (
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="cx-lf-btn cx-lf-btn--quiet">
            <SlidersHorizontal aria-hidden />
            View
          </button>
        </MenuTrigger>
        <MenuContent align="end" style={{ width: 240 }} aria-label="View">
          <ViewRow label="Sort" value={sortLabel(spec, sort)}>
            <SortOptions spec={spec} sort={sort} onSort={props.onSort} />
          </ViewRow>
          {canGroup ? (
            <ViewRow label="Group" value={groupLabel(spec, group)}>
              <GroupOptions spec={spec} group={group} onGroup={props.onGroup} />
            </ViewRow>
          ) : null}
          <ViewRow label="Columns" value="Choose">
            <ColumnsMenuContent columns={columns} hidden={props.hidden} onHidden={props.onHidden} />
          </ViewRow>
        </MenuContent>
      </Menu>
    );
  }

  return (
    <div className="cx-lf-group" role="group" aria-label="How the rows are shown">
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="cx-lf-btn cx-lf-btn--quiet">
            <SortAscending aria-hidden />
            {sortLabel(spec, sort)}
          </button>
        </MenuTrigger>
        <MenuContent align="start" style={{ minWidth: 200 }}>
          <SortOptions spec={spec} sort={sort} onSort={props.onSort} />
        </MenuContent>
      </Menu>
      {canGroup ? (
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className={`cx-lf-btn cx-lf-btn--quiet${group ? " cx-lf-btn--on" : ""}`}
              aria-label={`Group by: ${groupLabel(spec, group)}`}
            >
              <TextAlignLeft aria-hidden />
              Group <span style={{ fontWeight: 600, color: "var(--ink)" }}>{groupLabel(spec, group)}</span>
            </button>
          </MenuTrigger>
          <MenuContent align="start" style={{ minWidth: 180 }}>
            <GroupOptions spec={spec} group={group} onGroup={props.onGroup} />
          </MenuContent>
        </Menu>
      ) : null}
      <ColumnsMenu columns={columns} hidden={props.hidden} onHidden={props.onHidden} />
    </div>
  );
}

/** One row of the folded View menu: a label, the current answer, and its own menu. */
function ViewRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="cx-menu__item cx-lf-viewrow">
        <span className="cx-lf-viewrow__label">{label}</span>
        <span className="cx-lf-viewrow__value" style={{ flex: 1 }}>
          {value}
        </span>
        <ChevronRight aria-hidden style={{ width: 12, height: 12, color: "var(--ink-3)" }} />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className="cx-menu" sideOffset={6} style={{ minWidth: 200 }}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}
