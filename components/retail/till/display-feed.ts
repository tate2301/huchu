/**
 * The customer screen's feed: the till posts the sale as the customer should
 * see it, on a channel only windows of this browser hear (BroadcastChannel),
 * one per till. A screen that opens later asks, and the till posts again.
 * Same device only: a second monitor or an extended screen. A tablet of its
 * own would need the server to carry it.
 */

import type { TillContext } from "./types";

export type DisplayLine = { name: string; quantity: number; amount: number };

export type DisplayFeed =
  | { phase: "idle"; shop: string }
  | {
      phase: "selling";
      shop: string;
      lines: DisplayLine[];
      total: number;
      /** The total in ZiG at the day's rate, where the shop takes ZiG. */
      zig: { total: number; rate: number } | null;
      ecocash: TillContext["ecocash"];
    }
  | {
      phase: "paid";
      shop: string;
      total: number;
      change: { usd: number; zig: number } | null;
      points: { earned: number; balance: number } | null;
      customer: string | null;
    };

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
