import * as React from "react";
import Link from "next/link";

import { StateBadge } from "@/components/workspace/state-badge";
import { fillTemplate } from "@/lib/reports/actions";
import type { ListColumn, ReportRow } from "@/lib/reports/types";
import { formatDuration, formatWhen } from "@/lib/workspace/format";

import { cellText, dayText, diffTone, durationState, isBlank, toneOf } from "./model";

/**
 * The cell resolver (00-foundations 5.4.7, Cells board): one component that
 * decides how each kind of value looks, so every table answers the same way.
 * "Colour is only for things someone has to act on, and it always comes with
 * a word or a sign." Nothing is ever blank: no value is "—" in `--faint`.
 *
 * Returns the cell's content; the row puts it in a `role="cell"` with the
 * full value as its `title`.
 */
export function ListCell({
  column,
  row,
  rowHref,
  edit,
}: {
  column: ListColumn;
  row: ReportRow;
  /** The list's row link, for `link` and `ref` cells without their own. */
  rowHref?: string | null;
  /** An `edit-money` cell's controlled input. */
  edit?: { value: string; changed: boolean; refused?: string | null; onChange: (value: string) => void; label: string };
}) {
  const value = row[column.key];

  if (column.cell === "edit-money" && edit) {
    return (
      <span className={`cx-lf-edit${edit.changed ? " is-changed" : ""}${edit.refused ? " is-refused" : ""}`} title={edit.refused ?? undefined}>
        <span>{column.currency === "ZWG" ? "ZiG" : "US$"}</span>
        <input
          inputMode="decimal"
          aria-label={edit.label}
          value={edit.value}
          onChange={(event) => edit.onChange(event.target.value)}
        />
      </span>
    );
  }

  if (isBlank(value)) return column.empty === "blank" ? null : <span className="cx-lf-none">—</span>;
  const text = cellText(column, row);

  switch (column.cell) {
    case "ref":
    case "link": {
      const href = column.href ? fillTemplate(column.href, row) : rowHref;
      const className = column.cell === "ref" ? "cx-lf-ref" : "cx-lf-link-cell";
      const suffix = column.suffixKey ? row[column.suffixKey] : null;
      if (href && !isBlank(suffix)) {
        return (
          <>
            <Link href={href} className={className}>
              {text}
            </Link>
            <span className="cx-lf-muted">{String(suffix)}</span>
          </>
        );
      }
      return href ? (
        <Link href={href} className={className}>
          {text}
        </Link>
      ) : (
        // A reference with no page to open is a plain mono number, not a link.
        <span className={column.cell === "ref" ? "cx-lf-ref cx-lf-ref--plain" : className}>{text}</span>
      );
    }
    case "text": {
      const tone = column.toneKey ? row[column.toneKey] : null;
      return isBlank(tone) ? <>{text}</> : <span style={{ color: `var(--${String(tone)})` }}>{text}</span>;
    }
    case "muted":
      return <span className="cx-lf-muted">{text}</span>;
    case "mono":
      return <span className="cx-lf-monocell">{text}</span>;
    case "num": {
      const pill = column.pillKey ? row[column.pillKey] : null;
      if (pill) return <span className={`cx-lf-pill cx-lf-pill--${String(pill)}`}>{text}</span>;
      const gain = column.sign === "gain" && Number(value) > 0;
      return <span className={`cx-lf-numcell${gain ? " cx-lf-numcell--gain" : ""}`}>{text}</span>;
    }
    case "money":
      return <span className="cx-lf-moneycell">{text}</span>;
    case "zero":
      return <span className="cx-lf-zerocell">{text}</span>;
    case "owed":
      // Owing nothing is a quiet zero; in credit, a quiet "US$40.00 credit".
      return Number(value) > 0 ? <span className="cx-lf-pill cx-lf-pill--warn">{text}</span> : <span className="cx-lf-zerocell">{text}</span>;
    case "diff": {
      const tone = diffTone(column, value);
      return <span className={`cx-lf-pill cx-lf-pill--${tone}`}>{text}</span>;
    }
    case "state": {
      const tone = toneOf(column, row) ?? "neutral";
      return <StateBadge tone={tone}>{String(value)}</StateBadge>;
    }
    case "dot": {
      const tone = toneOf(column, row) ?? "hollow";
      return <span className={`cx-lf-dotcell cx-lf-dotcell--${tone}`}>{String(value)}</span>;
    }
    case "date": {
      const time = column.timeKey ? row[column.timeKey] : null;
      const tone = column.toneKey ? row[column.toneKey] : null;
      const day = (
        <>
          {dayText(column, String(value))}
          {!isBlank(time) ? <span className="cx-lf-time"> {String(time)}</span> : null}
        </>
      );
      return isBlank(tone) ? day : <span style={{ color: `var(--${String(tone)})` }}>{day}</span>;
    }
    case "when":
      return <span className="cx-lf-monocell">{formatWhen(String(value))}</span>;
    case "duration": {
      const state = durationState(column, row);
      const words = formatDuration(Number(value));
      const title =
        state === "running"
          ? `Still trading, open for ${words}`
          : state === "stale"
            ? `Open for ${words}, longer than a shift`
            : `Ran for ${words}`;
      return (
        <span className={`cx-lf-dur${state === "done" ? "" : ` cx-lf-dur--${state}`}`} title={title}>
          {words}
        </span>
      );
    }
    case "bar": {
      // No figure to draw ("No deliveries yet"): the words alone, faint.
      if (column.bar && isBlank(row[column.bar.pctKey])) return <span className="cx-lf-none">{text}</span>;
      const pct = column.bar ? Number(row[column.bar.pctKey] ?? 0) : 0;
      const low = column.bar ? pct < column.bar.warnBelow : false;
      return (
        <span className="cx-lf-meter">
          <span className="cx-lf-meter__track" aria-hidden="true">
            <span className={`cx-lf-meter__fill${low ? " is-low" : ""}`} style={{ display: "block", width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </span>
          <span className="cx-lf-meter__words">{text}</span>
        </span>
      );
    }
    default:
      return <>{text}</>;
  }
}

/** The full value for a cell's `title`: "15 August 2026 18:14", "Chipo Dube". */
export function cellTitle(column: ListColumn, row: ReportRow): string {
  const value = row[column.key];
  if (isBlank(value)) return "";
  if (column.cell === "date") {
    const time = column.timeKey ? row[column.timeKey] : null;
    return `${dayText(column, String(value))}${isBlank(time) ? "" : ` ${String(time)}`}`;
  }
  if (column.cell === "when") return formatWhen(String(value));
  if (column.cell === "duration") return formatDuration(Number(value));
  return cellText(column, row);
}
