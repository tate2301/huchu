"use client";

/**
 * The customer screen: the sale as the customer sees it, on a second screen
 * facing them. It follows the till on this device (display-feed.ts) and shows
 * one thing at a time: the shop; the lines and the total, with the EcoCash
 * code and the amount while they pay that way; then thank you and the change.
 * Drawn at a phone's width and scaled to the window, so a second screen shows
 * the same thing larger.
 */

import * as React from "react";

import { Check } from "@/lib/icons";
import { displayChannel, followDisplay, type DisplayFeed } from "./display-feed";
import { firstName, hhmm, qty, usd, whole, zig } from "./format";
import { RollingFigure } from "./motion";
import { changeText } from "./pay-tray";

type Selling = Extract<DisplayFeed, { phase: "selling" }>;

/** Where the customer sends an EcoCash payment: the merchant code or the number. Null for a terminal at the counter. */
function ecocashTo(ecocash: Selling["ecocash"]) {
  if (ecocash?.method === "MERCHANT_CODE" && ecocash.merchantCode) return { label: "EcoCash merchant code", value: ecocash.merchantCode };
  if (ecocash?.method === "PHONE_NUMBER" && ecocash.phone) return { label: "EcoCash number", value: ecocash.phone };
  return null;
}

function ShopTop({ feed }: { feed: DisplayFeed }) {
  return (
    <header className="cscr-top">
      <span className="cscr-mark" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- the shop's own logo, cached offline */}
        {feed.logo ? <img src={feed.logo} alt="" /> : feed.shop.charAt(0)}
      </span>
      <span className="cscr-shop">{feed.shop}</span>
    </header>
  );
}

/** Until the till answers, the screen waits blank: the shop's name is the till's to say, the same way every time. */
export function CustomerScreen({ tillId }: { tillId: string }) {
  const [feed, setFeed] = React.useState<DisplayFeed>({ phase: "idle", shop: "", logo: null });
  React.useEffect(() => {
    const channel = displayChannel(tillId);
    const stop = followDisplay(channel, setFeed);
    return () => {
      stop();
      channel.close();
    };
  }, [tillId]);

  if (!feed.shop) return <main className="cscr" />;

  if (feed.phase === "idle") {
    return (
      <main className="cscr is-idle">
        <ShopTop feed={feed} />
      </main>
    );
  }

  if (feed.phase === "paid") {
    return (
      <main className="cscr is-paid">
        <ShopTop feed={feed} />
        <div className="cscr-paid" role="status" aria-live="polite">
          <span className="cscr-tick">
            <span>
              <Check className="ic" />
            </span>
          </span>
          <h1 className="cscr-thanks">Thank you{feed.customer ? `, ${firstName(feed.customer)}` : ""}</h1>
          <span className="cscr-k">{feed.change ? "Your change" : "Paid"}</span>
          <span className="cscr-v">{feed.change ? changeText(feed.change) : usd(feed.total)}</span>
          {feed.points ? (
            <span className="cscr-z">
              +{whole(feed.points.earned)} points, {whole(feed.points.balance)} now
            </span>
          ) : null}
          <span className="cscr-ref">
            {feed.saleNo} · {hhmm(feed.at)}
          </span>
        </div>
      </main>
    );
  }

  const to = feed.paying?.tender === "ECOCASH" ? ecocashTo(feed.ecocash) : null;
  return (
    <main className={`cscr is-selling${to ? " is-paying" : ""}`}>
      <ShopTop feed={feed} />
      <ol className="cscr-lines" aria-label="Your items">
        {feed.lines.map((line, index) => (
          <li key={`${line.name}-${index}`}>
            <span>{qty(line.quantity)}</span>
            <span>{line.name}</span>
            <span>{usd(line.amount).replace("US$", "")}</span>
          </li>
        ))}
      </ol>
      <div className="cscr-total" aria-live="polite">
        <span className="cscr-total-k">Total</span>
        <RollingFigure className="cscr-total-v" value={feed.total} format={usd} />
        {feed.zig && !to ? <span className="cscr-total-z">or {zig(feed.zig.total)}</span> : null}
      </div>
      {to && feed.paying ? (
        <div className="cscr-pay" aria-live="polite">
          <span className="cscr-pay-k">{to.label}</span>
          <span className="cscr-pay-code">{to.value}</span>
          <span className="cscr-pay-v">{usd(feed.paying.amount)}</span>
        </div>
      ) : null}
    </main>
  );
}
