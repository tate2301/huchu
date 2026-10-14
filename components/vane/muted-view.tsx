"use client";

import { Button, Empty, TableShell, VaneMark } from "@/components/core";
import type { VaneMutedRow } from "@/lib/vane/lists";
import type { StopOffer } from "@/lib/vane/stops";

import { NOT_NOW_REASONS } from "./not-now-menu";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Muted (`/vane/muted`, the PageVaneMuted board): the cards set aside with
 * Not now, the reason given, who set each aside and when, and Bring back.
 * Above them, when this person keeps setting aside one kind of card, Vane
 * asks whether to stop showing it to them: Keep showing it, or Stop it for
 * me. Then the reasons Not now offers.
 *
 * Pure: the page feeds it.
 */
export function MutedView({
  rows,
  offer = null,
  choosing = false,
  onChoose,
  bringing,
  onBringBack,
}: {
  rows: VaneMutedRow[];
  /** The kind this person set aside often this month, when Vane asks to stop showing it to them. */
  offer?: StopOffer | null;
  choosing?: boolean;
  /** Stop it for me (true) or Keep showing it (false). */
  onChoose?: (offer: StopOffer, stopped: boolean) => void;
  /** The card being brought back. */
  bringing: string | null;
  onBringBack: (row: VaneMutedRow) => void;
}) {
  return (
    <>
      {offer && onChoose ? (
        <div className="vn-offer" role="group" aria-labelledby="vn-offer-t">
          <VaneMark size={16} />
          <span className="vn-offer-t" id="vn-offer-t">
            <b>
              You set aside “{offer.headline}” {offer.times} times this month.
            </b>
            <span>Shall I stop showing it to you? Everyone else who gets it still will.</span>
          </span>
          <span className="vn-offer-a">
            <Button disabled={choosing} onClick={() => onChoose(offer, false)}>
              Keep showing it
            </Button>
            <Button icon="bell" disabled={choosing} onClick={() => onChoose(offer, true)}>
              Stop it for me
            </Button>
          </span>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Empty icon="muted" title="Nothing set aside">
          A card you press Not now on comes here with the reason you gave, and Vane reads it before it raises that kind again.
        </Empty>
      ) : (
        <div className="wt" style={{ flex: "none", marginTop: "var(--space-24)" }}>
          <TableShell label="Muted cards">
            <table className="table" style={{ minWidth: 760 }}>
              <colgroup>
                <col style={{ width: "50%" }} />
                <col />
                <col style={{ width: "50%" }} />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>From</th>
                  <th>Reason</th>
                  <th>Set aside</th>
                  <th>
                    <span className="sr-only">Bring back</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="fill">
                      <span className="cell-lead">{row.headline}</span>
                    </td>
                    <td className="muted">{row.source}</td>
                    <td className="fill">
                      {row.reason ?? "—"}
                      {row.stopped ? <span className="muted"> · stopped for you</span> : null}
                    </td>
                    <td className="muted">{[row.by, row.at ? day(row.at) : null].filter(Boolean).join(", ") || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="link"
                        style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                        disabled={bringing === row.id}
                        aria-label={`Bring back: ${row.headline}`}
                        onClick={() => onBringBack(row)}
                      >
                        Bring back
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}
      <div style={{ margin: "var(--space-24) 28px 0", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <span className="sec-title">The reasons people give</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-8)" }}>
          {NOT_NOW_REASONS.map((reason) => (
            <span key={reason} className="pill pill-n">
              {reason}
            </span>
          ))}
        </div>
        <span className="muted" style={{ fontSize: "var(--text-12)" }}>Not now asks why in one tap. Vane reads the reason before it raises that kind again.</span>
      </div>
    </>
  );
}
