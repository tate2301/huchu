"use client";

import { Button, Empty, Pill, VaneMark } from "@/components/core";
import type { VaneMuted } from "@/lib/vane/pages";
import { MUTE_REASONS } from "@/lib/vane/reasons";

import { shortDate } from "./format";

/**
 * Muted (PageVaneMuted): every card a person set aside, where it came from,
 * the reason they gave, and who and when, each with Bring back; above them,
 * when one kind keeps being set aside, Vane asks whether to stop showing it
 * to this person; then the reasons people pick from.
 */
export function MutedView({
  muted: { rows, offer },
  onBringBack,
  onChoose,
  busy = false,
}: {
  muted: VaneMuted;
  /** Bring back: the card goes back to For you. */
  onBringBack?: (id: string) => void;
  /** Stop it for me (true) or Keep showing it (false), for the offer's kind. */
  onChoose?: (itemId: string, stopped: boolean) => void;
  busy?: boolean;
}) {
  return (
    <div className="kbody vn-body">
      {offer && onChoose ? (
        <div className="vn-offer" role="group" aria-label="Stop showing this kind of card">
          <VaneMark size={16} />
          <span className="vn-offer-t">
            <b>
              You set aside “{offer.headline}” {offer.times} times this month.
            </b>
            <br />
            <span className="vn-offer-d">Shall I stop showing it to you? Everyone else who gets it still will.</span>
          </span>
          <span className="vn-offer-a">
            <Button disabled={busy} onClick={() => onChoose(offer.itemId, false)}>
              Keep showing it
            </Button>
            <Button icon="bell" disabled={busy} onClick={() => onChoose(offer.itemId, true)}>
              Stop it for me
            </Button>
          </span>
        </div>
      ) : null}
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
                <th className="vn-c-back">
                  <span className="sr-only">Bring back</span>
                </th>
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
                    <span className="truncate">
                      {row.reason ?? "No reason given"}
                      {row.stopped ? " · stopped for you" : ""}
                    </span>
                  </td>
                  <td className="muted">{[row.by, row.at ? shortDate(row.at) : null].filter(Boolean).join(", ")}</td>
                  <td>
                    {onBringBack ? (
                      <button
                        type="button"
                        className="link vn-linkbtn"
                        disabled={busy}
                        aria-label={`Bring back “${row.headline}”`}
                        onClick={() => onBringBack(row.id)}
                      >
                        Bring back
                      </button>
                    ) : null}
                  </td>
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
