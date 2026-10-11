"use client";

/**
 * The customer screen: the sale as the customer sees it, on a second screen
 * facing them. It follows the till on this device (display-feed.ts) and says
 * three things in turn: who the shop is, what they are buying and what it
 * comes to (and how to pay by EcoCash), then thank you and their change.
 */

import * as React from "react";

import { formatZigRate } from "@/lib/retail/payment-words";
import { displayChannel, followDisplay, type DisplayFeed } from "./display-feed";
import { firstName, qty, usd, whole, zig } from "./format";
import { RollingFigure } from "./motion";
import { changeText } from "./pay-tray";

/** How a customer pays the shop by EcoCash, said to them; null for a terminal (the counter keys it). */
function ecocashWords(ecocash: Extract<DisplayFeed, { phase: "selling" }>["ecocash"], total: number) {
  if (ecocash?.method === "MERCHANT_CODE" && ecocash.merchantCode) {
    return `EcoCash: pay merchant ${ecocash.merchantCode}${ecocash.name ? `, ${ecocash.name}` : ""}`;
  }
  if (ecocash?.method === "PHONE_NUMBER" && ecocash.phone) return `EcoCash: send ${usd(total)} to ${ecocash.phone}`;
  return null;
}

/** Until the till answers, the screen waits blank: the shop's name is the till's to say, the same way every time. */
export function CustomerScreen({ tillId }: { tillId: string }) {
  const [feed, setFeed] = React.useState<DisplayFeed>({ phase: "idle", shop: "" });
  React.useEffect(() => {
    const channel = displayChannel(tillId);
    const stop = followDisplay(channel, setFeed);
    return () => {
      stop();
      channel.close();
    };
  }, [tillId]);

  if (feed.phase === "idle") {
    return (
      <main className="display is-idle">
        {feed.shop ? (
          <>
            <h1 className="display-shop">{feed.shop}</h1>
            <p className="display-note">Your items show here as they are rung up.</p>
          </>
        ) : null}
      </main>
    );
  }

  if (feed.phase === "paid") {
    return (
      <main className="display is-paid" aria-live="polite">
        <h1 className="display-thanks">Thank you{feed.customer ? `, ${firstName(feed.customer)}` : ""}</h1>
        {feed.change ? (
          <p className="display-change">
            Your change <span className="num">{changeText(feed.change)}</span>
          </p>
        ) : (
          <p className="display-change">
            Paid <span className="num">{usd(feed.total)}</span>
          </p>
        )}
        {feed.points ? (
          <p className="display-note">
            +{whole(feed.points.earned)} points. You have {whole(feed.points.balance)} now.
          </p>
        ) : null}
      </main>
    );
  }

  const ecocash = ecocashWords(feed.ecocash, feed.total);
  return (
    <main className="display is-selling">
      <header className="display-head">
        <span className="display-shop is-small">{feed.shop}</span>
      </header>
      <ol className="display-lines" aria-label="Your items">
        {feed.lines.map((line, index) => (
          <li key={`${line.name}-${index}`} className={index === feed.lines.length - 1 ? "is-last" : undefined}>
            <span className="truncate">{line.name}</span>
            <span className="num muted">{qty(line.quantity)} ×</span>
            <span className="num">{usd(line.amount)}</span>
          </li>
        ))}
      </ol>
      <footer className="display-foot" aria-live="polite">
        <span className="display-label">To pay</span>
        <RollingFigure className="display-total" value={feed.total} format={usd} />
        {feed.zig ? (
          <span className="display-note num">
            or {zig(feed.zig.total)} at ZiG {formatZigRate(feed.zig.rate)} to US$1
          </span>
        ) : null}
        {ecocash ? <span className="display-pay">{ecocash}</span> : null}
      </footer>
    </main>
  );
}
