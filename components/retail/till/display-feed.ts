/**
 * The customer screen's feed: the till posts the sale as the customer should
 * see it, on a channel only windows of this browser hear (BroadcastChannel),
 * one per till. A screen that opens later asks, and the till posts again.
 * Same device only: a second monitor or an extended screen. A tablet of its
 * own would need the server to carry it.
 */

import type { TenderType, TillContext } from "./types";

export type DisplayLine = { name: string; quantity: number; amount: number };

/** The shop as the customer sees it at the top of the screen: its name and its logo, when it has one. */
type DisplayShop = { shop: string; logo: string | null };

/** The part being paid while the tray is open: its tender and its amount in US dollars. */
export type DisplayPaying = { tender: TenderType; amount: number };

export type DisplayFeed =
  | ({ phase: "idle" } & DisplayShop)
  | ({
      phase: "selling";
      lines: DisplayLine[];
      total: number;
      /** The total in ZiG at the day's rate, where the shop takes ZiG. */
      zig: { total: number; rate: number } | null;
      ecocash: TillContext["ecocash"];
      /** Null until the tray is open on a tender. */
      paying: DisplayPaying | null;
    } & DisplayShop)
  | ({
      phase: "paid";
      total: number;
      change: { usd: number; zig: number } | null;
      points: { earned: number; balance: number } | null;
      customer: string | null;
      /** The sale's number, or a sale saved on the till: its tag. */
      saleNo: string;
      at: string;
    } & DisplayShop);

type Message = { kind: "feed"; feed: DisplayFeed } | { kind: "hello" };

export function displayChannel(tillId: string) {
  return new BroadcastChannel(`till-display:${tillId}`);
}

/** The till's side: posts each feed, and again whenever a screen says hello. */
export function postDisplay(channel: BroadcastChannel, feed: DisplayFeed) {
  channel.postMessage({ kind: "feed", feed } satisfies Message);
}

export function onDisplayHello(channel: BroadcastChannel, answer: () => void) {
  const listen = (event: MessageEvent<Message>) => {
    if (event.data?.kind === "hello") answer();
  };
  channel.addEventListener("message", listen);
  return () => channel.removeEventListener("message", listen);
}

/** The screen's side: says hello, then follows every feed. */
export function followDisplay(channel: BroadcastChannel, onFeed: (feed: DisplayFeed) => void) {
  const listen = (event: MessageEvent<Message>) => {
    if (event.data?.kind === "feed") onFeed(event.data.feed);
  };
  channel.addEventListener("message", listen);
  channel.postMessage({ kind: "hello" } satisfies Message);
  return () => channel.removeEventListener("message", listen);
}
