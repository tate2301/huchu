"use client";

import { Empty, Pill } from "@/components/core";
import type { VaneMutedRow } from "@/lib/vane/pages";
import { MUTE_REASONS } from "@/lib/vane/reasons";

import { shortDate } from "./format";

/**
 * Muted (PageVaneMuted): every card a person set aside, where it came from,
 * the reason they gave, and who and when; then the reasons people pick from.
 */
export function MutedView({ rows }: { rows: VaneMutedRow[] }) {
  return (
    <div className="kbody vn-body">
      {rows.length === 0 ? (
        <Empty icon="muted" title="Nothing is set aside">
          A card you press Not now on comes here, with the reason you gave.
        </Empty>
      ) : (
        <div className="wt">
          <table className="table vn-muted">
            <thead>
              <tr>
                <th>Card</th>
                <th className="vn-c-from">From</th>
                <th>Reason</th>
                <th className="vn-c-aside">Set aside</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="fill">
                    <span className="truncate">{row.headline}</span>
                  </td>
                  <td className="muted">{row.source}</td>
                  <td className="fill">
                    <span className="truncate">{row.reason ?? "No reason given"}</span>
                  </td>
                  <td className="muted">{[row.by, row.at ? shortDate(row.at) : null].filter(Boolean).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="vn-sec vn-reasons">
        <span className="sec-title">The reasons people give</span>
        <div className="vn-pills">
          {MUTE_REASONS.map((reason) => (
            <Pill key={reason} tone="n">
              {reason}
            </Pill>
          ))}
        </div>
        <span className="vn-note">Not now asks why in one tap, and the reason stays with the card.</span>
      </div>
    </div>
  );
}
