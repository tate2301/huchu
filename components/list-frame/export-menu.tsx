"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Menu, MenuCaption, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { ChevronDown, Download } from "@/lib/icons";
import { formatCount } from "@/lib/workspace/format";

/**
 * Export (00-foundations 5.4.4 item 7, W-55): a 260px menu headed with what
 * leaves the page — "The 312 shifts the filters show", or the ticked rows —
 * and the three files, each with its extension.
 */

export type ExportFormat = "xlsx" | "csv" | "pdf";

const FORMATS: Array<{ format: ExportFormat; label: string }> = [
  { format: "xlsx", label: "Spreadsheet" },
  { format: "csv", label: "Comma-separated" },
  { format: "pdf", label: "PDF, ready to print" },
];

export function ExportItems({ caption, onExport }: { caption: string; onExport: (format: ExportFormat) => void }) {
  return (
    <>
      <MenuCaption>{caption}</MenuCaption>
      {FORMATS.map((entry) => (
        <MenuItem key={entry.format} hint={`.${entry.format}`} onSelect={() => onExport(entry.format)}>
          {entry.label}
        </MenuItem>
      ))}
    </>
  );
}

export function exportCaption(total: number, noun: string, selected?: number): string {
  if (selected !== undefined) return `The ${formatCount(selected)} ${noun} you ticked`;
  return `The ${formatCount(total)} ${noun} the filters show`;
}

export function ExportMenu({
  caption,
  onExport,
  trigger,
  extras,
}: {
  caption: string;
  onExport: (format: ExportFormat) => void;
  /** Defaults to the toolbar's "Export ⌄" button. */
  trigger?: React.ReactElement;
  /** Other ways in, under a separator ("Import a spreadsheet"): the list's `exportExtras`. */
  extras?: Array<{ label: string; href: string }>;
}) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        {trigger ?? (
          <button type="button" className="cx-lf-btn">
            <Download aria-hidden />
            Export
            <span className="cx-lf-btn__chev" aria-hidden="true">
              <ChevronDown />
            </span>
          </button>
        )}
      </MenuTrigger>
      <MenuContent align="end" roomy style={{ width: 260 }}>
        <ExportItems caption={caption} onExport={onExport} />
        {extras?.length ? (
          <>
            <MenuSeparator />
            {extras.map((extra) => (
              <MenuItem key={extra.href} onSelect={() => router.push(extra.href)}>
                {extra.label}
              </MenuItem>
            ))}
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
