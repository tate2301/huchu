"use client";

import { Button, Empty, Icon, TableShell, Person } from "@/components/core";
import type { VaneMutedRow } from "@/lib/vane/lists";
import type { StopOffer } from "@/lib/vane/topics";

import { NOT_NOW_REASONS } from "./not-now-menu";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Muted (`/vane/muted`, the PageVaneMuted board): first, any topic this
 * person set aside often this month, with Stop it for me; the cards set aside
 * with Not now, the reason given, who set each aside and when, and Bring
 * back; the topics stopped for this person, with Show it again; then the
 * reasons Not now offers.
 *
 * Pure: the page feeds it.
 */
export function MutedView({
  rows,
  bringing,
  onBringBack,
  offers = [],
  stopped = [],
  changingTopic = null,
  onTopic,
  onKeep,
}: {
  rows: VaneMutedRow[];
  /** The card being brought back. */
  bringing: string | null;
  onBringBack: (row: VaneMutedRow) => void;
  /** Topics set aside often this month: Vane offers to stop them for this person. */
  offers?: StopOffer[];
  /** Topics this person stopped. */
  stopped?: string[];
  /** The topic being stopped or shown again. */
  changingTopic?: string | null;
  onTopic?: (topic: string, stop: boolean) => void;
  /** "Keep showing it": the offer goes for this month. */
  onKeep?: (topic: string) => void;
}) {
  return (
    <>
      {offers.map((offer) => (
        <div key={offer.topic} className="kbody" role="group" aria-label={`Stop ${offer.topic}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-12)", margin: "var(--space-24) 28px 0" }}>
          <Icon name="muted" />
          <span style={{ flex: "1 1 320px" }}>
            You set aside “{offer.topic}” {offer.times} times this month. Shall I stop showing it to you? Everyone else who gets it still will.
          </span>
          <Button onClick={() => onKeep?.(offer.topic)}>Keep showing it</Button>
          <Button icon="muted" busy={changingTopic === offer.topic} onClick={() => onTopic?.(offer.topic, true)}>
            Stop it for me
          </Button>
        </div>
      ))}
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
                    <td className="fill">{row.reason ?? "—"}</td>
                    <td className="muted">
                      {row.by ? (
                        <Person name={row.by} src={row.byImage}>
                          {[row.by, row.at ? day(row.at) : null].filter(Boolean).join(", ")}
                        </Person>
                      ) : (
                        [row.at ? day(row.at) : null].filter(Boolean).join(", ") || "—"
                      )}
                    </td>
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
      {stopped.length > 0 ? (
        <div style={{ margin: "var(--space-24) 28px 0", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
          <span className="sec-title">Stopped for you</span>
          {stopped.map((topic) => (
            <div key={topic} style={{ display: "flex", alignItems: "center", gap: "var(--space-12)" }}>
              <span style={{ flex: 1 }}>{topic}</span>
              <Button size="sm" busy={changingTopic === topic} onClick={() => onTopic?.(topic, false)}>
                Show it again
              </Button>
            </div>
          ))}
        </div>
      ) : null}
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
