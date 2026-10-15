"use client";

import * as React from "react";

import { Button, ButtonLink, Empty } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import type { WeekInsight, WeekInsights } from "@/lib/reports/week-insights";

export type PinTarget = { id: string; title: string };

/**
 * Reports → Insights (ReportsInsights), drawn: the sentence that says what
 * was read, then each insight as a card — its finding, the figures, the
 * question it ran (which opens the report), its act, Pin to the board and
 * Not useful. Pure: the page owns the fetching and the presses.
 */
export function WeekInsightsView({
  data,
  insights,
  boards,
  pinning,
  onPin,
  onNotUseful,
}: {
  data: WeekInsights;
  /** The insights still shown: Not useful takes one away. */
  insights: WeekInsight[];
  /** Boards this person can pin to, when the workspace chose none. */
  boards: PinTarget[];
  /** The insight being pinned now. */
  pinning: string | null;
  onPin: (insight: WeekInsight, board: PinTarget) => void;
  onNotUseful: (insight: WeekInsight) => void;
}) {
  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <div className="finding" style={{ padding: 0 }}>
        <p className="lede-figure">
          {data.finding.fact} <span className="q">{data.finding.rest}</span>
        </p>
      </div>
      {insights.length === 0 ? (
        <Empty icon="insights" title="Nothing stands out yet">
          Insights are read from the reports you can open. When there is enough in them, what stands out this week shows here.
        </Empty>
      ) : (
        insights.map((insight) => (
          <article key={insight.id} className="ins">
            <h2>{insight.headline}</h2>
            <p>{insight.body}</p>
            {insight.bars.length > 1 ? (
              <div className="ins-v">
                {insight.bars.map((bar) => (
                  <div key={bar.label} className="hb">
                    <span className="truncate" title={bar.label}>
                      {bar.label}
                    </span>
                    <span className="grow">
                      <span
                        className={bar.key ? "bar is-key" : "bar"}
                        style={{ display: "block", width: `${Math.max(0, Math.min(1, bar.share)) * 100}%` }}
                      />
                    </span>
                    <span className="num">{bar.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="ins-f">
              {insight.question ? (
                <ButtonLink variant="quiet" icon="table" href={insight.question.href}>
                  {insight.question.words}
                </ButtonLink>
              ) : null}
              <div className="end">
                {insight.action ? (
                  <ButtonLink icon="list" href={insight.action.href}>
                    {insight.action.label}
                  </ButtonLink>
                ) : null}
                {insight.pin ? <PinButton insight={insight} board={data.board} boards={boards} busy={pinning === insight.id} onPin={onPin} /> : null}
                <Button variant="quiet" iconOnly icon="thumbdown" label="Not useful" aria-label="Not useful" onClick={() => onNotUseful(insight)} />
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

/** Pin to the workspace's board; without one, to a board of this person's choosing. */
function PinButton({
  insight,
  board,
  boards,
  busy,
  onPin,
}: {
  insight: WeekInsight;
  board: PinTarget | null;
  boards: PinTarget[];
  busy: boolean;
  onPin: (insight: WeekInsight, board: PinTarget) => void;
}) {
  if (board) {
    return (
      <Button icon="pin" busy={busy} onClick={() => onPin(insight, board)}>
        Pin to {board.title}
      </Button>
    );
  }
  if (boards.length === 0) {
    return (
      <Button icon="pin" disabled title="Make a board in All reports first: a report of several blocks.">
        Pin to a board
      </Button>
    );
  }
  return (
    <MenuButton
      icon="pin"
      busy={busy}
      label="Pin to a board"
      items={boards.map((target) => ({ key: target.id, label: target.title, onSelect: () => onPin(insight, target) }))}
    >
      Pin to a board
    </MenuButton>
  );
}
