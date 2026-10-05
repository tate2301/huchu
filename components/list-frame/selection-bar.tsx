"use client";

import * as React from "react";

import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { CopyLink, DotsThree, Download, Printer, X } from "@/lib/icons";
import type { ListAction } from "@/lib/reports/types";
import { formatCount } from "@/lib/workspace/format";

import { ExportItems, type ExportFormat } from "./export-menu";

/**
 * The selection bar (00-foundations 5.4.5, Selected board): it replaces the
 * toolbar, same 48px, while any row is ticked. "3 selected · Select all 312 │
 * Print Z-reports · Export 3 · Copy shift numbers · ⋯". Actions fold into ⋯
 * from the right as the bar narrows; the role's missing actions are not drawn.
 */

export type BulkEntry = ListAction | { key: "export" };

function iconFor(action: ListAction) {
  if ("download" in action.do) return action.do.open ? <Printer aria-hidden /> : <Download aria-hidden />;
  if ("copy" in action.do) return <CopyLink aria-hidden />;
  return null;
}

export function SelectionBar({
  noun,
  count,
  total,
  allSelected,
  selectingAll,
  bulk,
  /** How many of the shown actions fold into ⋯ (0, 1 or 2), from the bar's width. */
  foldCount,
  hideSelectAll,
  onClear,
  onSelectAll,
  onAction,
  onExport,
}: {
  noun: string;
  count: number;
  total: number;
  allSelected: boolean;
  selectingAll: boolean;
  bulk: BulkEntry[];
  foldCount: number;
  hideSelectAll: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  onAction: (action: ListAction) => void;
  onExport: (format: ExportFormat) => void;
}) {
  const shown = bulk.filter((entry) => !("more" in entry && entry.more));
  const more = bulk.filter((entry): entry is ListAction => "more" in entry && Boolean(entry.more));
  const keep = shown.slice(0, Math.max(0, shown.length - foldCount));
  const folded = shown.slice(keep.length);
  const exportCaption = `The ${formatCount(count)} ${noun} you ticked`;

  return (
    <div role="toolbar" aria-label={`Selected ${noun}`} className="cx-lf-selbar">
      <button type="button" className="cx-lf-selbar__clear" aria-label="Clear the selection" onClick={onClear}>
        <X aria-hidden />
      </button>
      <span className="cx-lf-selbar__count">
        {allSelected && count === total ? (
          <>
            All <span className="mono">{formatCount(total)}</span> selected
          </>
        ) : (
          <>
            <span className="mono">{formatCount(count)}</span> selected
          </>
        )}
      </span>
      {!allSelected && !hideSelectAll ? (
        <button type="button" className="cx-lf-selbar__all" onClick={onSelectAll} disabled={selectingAll}>
          Select all <span className="mono">{formatCount(total)}</span>
        </button>
      ) : null}
      <span className="cx-lf-selbar__rule" aria-hidden="true" />
      <div className="cx-lf-group" role="group" aria-label={`Actions for the selected ${noun}`}>
        {keep.map((entry) =>
          entry.key === "export" || !("do" in entry) ? (
            <Menu key="export">
              <MenuTrigger asChild>
                <button type="button" className="cx-lf-btn">
                  <Download aria-hidden />
                  Export <span className="mono">{formatCount(count)}</span>
                </button>
              </MenuTrigger>
              <MenuContent align="start" roomy style={{ width: 260 }}>
                <ExportItems caption={exportCaption} onExport={onExport} />
              </MenuContent>
            </Menu>
          ) : (
            <button key={entry.key} type="button" className="cx-lf-btn" onClick={() => onAction(entry)}>
              {iconFor(entry)}
              {entry.label}
            </button>
          ),
        )}
        {folded.length + more.length > 0 ? (
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="cx-lf-btn cx-lf-selbar__more" aria-label="More actions for the selection">
                <DotsThree weight="bold" aria-hidden />
              </button>
            </MenuTrigger>
            <MenuContent align="end" style={{ width: 240 }}>
              {folded.map((entry) =>
                entry.key === "export" || !("do" in entry) ? (
                  <React.Fragment key="export">
                    <ExportItems caption={exportCaption} onExport={onExport} />
                    <MenuSeparator />
                  </React.Fragment>
                ) : (
                  <MenuItem key={entry.key} onSelect={() => onAction(entry)}>
                    {entry.label}
                  </MenuItem>
                ),
              )}
              {more.map((entry) => (
                <MenuItem key={entry.key} danger={entry.tone === "bad"} onSelect={() => onAction(entry)}>
                  {entry.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
      </div>
    </div>
  );
}
