"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Drawer } from "@/components/core";
import { formatMoney } from "@/lib/workspace/format";
import type { VaneCardDetail } from "@/lib/vane/pages";

import { longDate, plural, when } from "./format";
import { NotNow } from "./not-now";

/**
 * A card and what Vane read for it (PageVaneCard): the tables and how many
 * rows each answered, the question it ran, the draft it made if it made one,
 * and the card's own button. Opened from What I read, beside the list.
 */
export function CardDrawer({
  card,
  loading,
  failed,
  open,
  onOpenChange,
  onAct,
  onNotNow,
  muting,
}: {
  card: VaneCardDetail | null;
  loading: boolean;
  failed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAct: (card: VaneCardDetail) => void;
  onNotNow: (card: VaneCardDetail, reason: string) => void;
  muting: boolean;
}) {
  const title = card?.headline ?? (failed ? "The card did not load" : "Reading the card");
  const sub = card ? `${card.kind === "issue" ? "Issue" : "Suggestion"} · ${card.source} · ${when(card.createdAt)}` : undefined;
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      sub={sub}
      width={460}
      footer={
        card ? (
          <>
            {card.status === "open" ? <NotNow labelled busy={muting} onPick={(reason) => onNotNow(card, reason)} /> : null}
            {card.action ? (
              <Button variant="primary" shortcut="S" onClick={() => onAct(card)}>
                {card.action.label}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {card ? (
        <CardRead card={card} />
      ) : loading ? (
        <div aria-busy="true" className="vn-sec">
          <div className="skeleton" style={{ height: 80 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      ) : (
        <p className="vn-st-d">That card is not one of yours, or it is gone. Close this and look at For you again.</p>
      )}
    </Drawer>
  );
}

function CardRead({ card }: { card: VaneCardDetail }) {
  return (
    <>
      <div className="vn-sec">
        <span className="sec-title">It read</span>
        {card.readFrom.length ? (
          <dl className="attrs vn-read">
            {card.readFrom.map((entry) => (
              <React.Fragment key={entry.table}>
                <dt>
                  {entry.href ? (
                    <Link className="link" href={entry.href}>
                      {entry.label}
                    </Link>
                  ) : (
                    entry.label
                  )}
                </dt>
                <dd>{plural(entry.rows, "row")}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : (
          <p className="vn-st-d">This card does not say what it read.</p>
        )}
      </div>
      <div className="vn-sec">
        <span className="sec-title">The question it ran</span>
        {card.sql ? (
          <>
            <pre className="vn-sql">{card.sql}</pre>
            <span className="vn-note">{plural(card.rows, "row")}, read only, through Vane&apos;s own reader.</span>
          </>
        ) : (
          <p className="vn-st-d">It kept no question for this card.</p>
        )}
      </div>
      {card.draft ? (
        <div className="vn-sec">
          <span className="sec-title">What it drafted</span>
          <dl className="attrs">
            <dt>
              <Link className="link" href={card.draft.href}>
                {card.draft.number}
              </Link>
            </dt>
            <dd>Draft, made by Vane</dd>
            <dt>Customer</dt>
            <dd>{card.draft.customer}</dd>
            <dt>Lines</dt>
            <dd>{card.draft.lines}</dd>
            <dt>Total</dt>
            <dd>{formatMoney(card.draft.total, card.draft.currency)}</dd>
            <dt>{card.draft.kind === "invoice" ? "Due" : "Valid until"}</dt>
            <dd>{card.draft.due ? longDate(card.draft.due) : "Not set"}</dd>
          </dl>
        </div>
      ) : null}
      <div className="vn-callout">
        {card.draft?.kind === "invoice"
          ? "Nothing is issued until someone presses Issue on the invoice."
          : card.draft?.kind === "quote"
            ? "Nothing is sent until someone presses Send on the quote."
            : "Vane changes nothing itself. The button takes you to where a person does it."}
      </div>
    </>
  );
}
