/**
 * Figures as the till writes them: US$21.68, a true minus, Harare's clock.
 * One place, so every screen agrees with the receipt.
 */

import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";

import type { TenderType } from "./types";

const grouped = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 21.68 → "US$21.68"; −7.15 → "−US$7.15". */
export function usd(value: number): string {
  const text = `US$${grouped.format(Math.abs(value))}`;
  return value < -0.004 ? `−${text}` : text;
}

/** A variance: "+US$1.00", "−US$7.15", "US$0.00". */
export function signedUsd(value: number): string {
  if (Math.abs(value) < 0.005) return usd(0);
  return value > 0 ? `+${usd(value)}` : usd(value);
}

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: SHOP_TIME_ZONE,
});
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: SHOP_TIME_ZONE });

/** "08:14", in Harare. */
export function hhmm(value: string | Date | null | undefined): string {
  if (!value) return "";
  return clock.format(new Date(value));
}

/** "5 October", in Harare. */
export function dayMonth(value: string | Date | null | undefined): string {
  if (!value) return "";
  return day.format(new Date(value));
}

const weekdayDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: SHOP_TIME_ZONE });

/** "Saturday 3 October", in Harare. */
export function weekdayDayMonth(value: string | Date | null | undefined): string {
  if (!value) return "";
  return weekdayDay.format(new Date(value));
}

/** When a device was paired, as a sentence ends: "at 07:52" today, "on 3 October" before. */
export function pairedWhen(at: string): string {
  const when = new Date(at);
  const today = new Date().toDateString() === when.toDateString();
  return today ? `at ${hhmm(at)}` : `on ${dayMonth(at)}`;
}

/** Units that read the same for one or many, sold by weight, volume or length: 14 kg, 3 l. */
export const MEASURES = new Set(["kg", "g", "l", "ml", "m", "cm"]);

/** A role as the till says it in a sentence. */
export const ROLE_WORD: Record<string, string> = {
  CASHIER: "cashier",
  SHOP_MANAGER: "shop manager",
  MANAGER: "manager",
  SUPERADMIN: "owner",
};

/** A whole number as the till writes it: 1,240. One locale for every figure on the till. */
export function whole(n: number): string {
  return n.toLocaleString("en-GB");
}

/** "1 item", "7 items". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${whole(n)} ${n === 1 ? one : many}`;
}

/** A quantity as the line shows it: 6, 1.4, 0.25. */
export function qty(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** The first name: what the till calls someone in a sentence. */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "you";
}

/** Each tender as the till names it; the shop's own list and order come from `context.tenders`. */
export const TENDER_LABEL: Record<TenderType, string> = {
  CASH: "Cash",
  CARD: "Card",
  ECOCASH: "EcoCash",
  INNBUCKS: "InnBucks",
  TRANSFER: "Bank transfer",
  ON_ACCOUNT: "On account",
  VOUCHER: "Voucher",
};

/** A payment as a sentence or a row names it: "Cash", "Cash ZiG", "EcoCash". */
export function paymentLabel(tender: string, currency?: string | null): string {
  if (tender === "CASH" && currency === "ZWG") return "Cash ZiG";
  return TENDER_LABEL[tender as TenderType] ?? tender;
}

/** 11 → "ZiG 11.00": ZiG the way `usd` writes US dollars. */
export function zig(value: number): string {
  const text = `ZiG ${grouped.format(Math.abs(value))}`;
  return value < -0.004 ? `−${text}` : text;
}
