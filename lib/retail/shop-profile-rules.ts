import type { RetailBusinessType } from "@prisma/client";

/**
 * The shop's profile: what kind of shop it is, and the features that come with
 * that.
 *
 * The business type is chosen on Setup › Shop. It seeds the categories a
 * shop starts with (`lib/retail/categories.ts`) and decides which shop-type
 * features exist at all. Each feature then has its own switch, so an owner can
 * keep a liquor store's age check and turn its empties off.
 *
 * A feature is *on* only when both agree: the business type has it and its
 * switch is on. That is `shopFeatures`, and it is the only thing the till and
 * the admin read. Keeping the switches separate from the type means switching a
 * liquor store to General retail turns everything liquor off, and switching it
 * back restores exactly what the owner had set.
 */

export const RETAIL_BUSINESS_TYPES = ["GENERAL", "LIQUOR"] as const satisfies readonly RetailBusinessType[];

/** The words a shopkeeper sees for each type. */
export const BUSINESS_TYPE_LABELS: Record<RetailBusinessType, string> = {
  GENERAL: "General retail",
  LIQUOR: "Liquor store",
};

/** Licence hours run on the shop's clock, which is Harare's for every tenant today. */
export const SHOP_TIME_ZONE = "Africa/Harare";

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export type ShopHours = {
  weekdayOpensAt: string;
  weekdayClosesAt: string;
  sundayOpensAt: string;
  sundayClosesAt: string;
};

export type ShopSwitches = {
  ageCheck: boolean;
  licenceHours: boolean;
  emptiesAndDeposits: boolean;
  casesAndSingles: boolean;
};

export type ShopProfile = ShopSwitches &
  ShopHours & {
    businessType: RetailBusinessType;
    licenceNumber: string | null;
    /** `YYYY-MM-DD`, the day the licence runs out. */
    licenceExpiresOn: string | null;
    /** False until somebody has saved the profile once. */
    saved: boolean;
    updatedAt: string | null;
  };

export type ShopFeatures = ShopSwitches;

export const DEFAULT_SHOP_PROFILE: ShopProfile = {
  businessType: "GENERAL",
  ageCheck: true,
  licenceHours: true,
  emptiesAndDeposits: true,
  casesAndSingles: true,
  weekdayOpensAt: "08:00",
  weekdayClosesAt: "22:00",
  sundayOpensAt: "10:00",
  sundayClosesAt: "18:00",
  licenceNumber: null,
  licenceExpiresOn: null,
  saved: false,
  updatedAt: null,
};

/**
 * Which features are on.
 *
 * Every one of them belongs to the liquor store today. When a second shop type
 * brings features of its own, this is where the type decides which switches it
 * honours.
 */
export function shopFeatures(profile: Pick<ShopProfile, "businessType"> & ShopSwitches): ShopFeatures {
  const liquor = profile.businessType === "LIQUOR";
  return {
    ageCheck: liquor && profile.ageCheck,
    licenceHours: liquor && profile.licenceHours,
    emptiesAndDeposits: liquor && profile.emptiesAndDeposits,
    casesAndSingles: liquor && profile.casesAndSingles,
  };
}

function minutes(hhmm: string) {
  const [hours, mins] = hhmm.split(":").map(Number);
  return hours * 60 + mins;
}

/**
 * The shop's weekday and time of day at `at`, read on the shop's own clock.
 *
 * `Intl` rather than arithmetic on the UTC hour: the server runs in UTC, the
 * licence is written in Harare time, and the two only agree by accident.
 */
export function shopClock(at: Date, timeZone = SHOP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: read("weekday"), minutes: Number(read("hour")) * 60 + Number(read("minute")) };
}

/**
 * Whether the licence lets the shop sell alcohol at `at`.
 *
 * A window that closes earlier than it opens runs past midnight — a bar open
 * 10:00 to 01:00 — so the test flips from "between" to "outside the gap".
 * A window that opens and closes at the same minute is closed all day.
 */
export function isWithinLicenceHours(hours: ShopHours, at: Date, timeZone = SHOP_TIME_ZONE) {
  const clock = shopClock(at, timeZone);
  const sunday = clock.weekday === "Sun";
  const opens = minutes(sunday ? hours.sundayOpensAt : hours.weekdayOpensAt);
  const closes = minutes(sunday ? hours.sundayClosesAt : hours.weekdayClosesAt);
  if (opens === closes) return false;
  if (opens < closes) return clock.minutes >= opens && clock.minutes < closes;
  return clock.minutes >= opens || clock.minutes < closes;
}

/** "08:00" to "8am", "22:30" to "10:30pm" — how a cashier reads the licence. */
export function clockLabel(hhmm: string) {
  const [hours, mins] = hhmm.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return mins === 0 ? `${twelve}${suffix}` : `${twelve}:${String(mins).padStart(2, "0")}${suffix}`;
}

/** Today's licence window at `at`, in words. */
export function licenceWindowLabel(hours: ShopHours, at: Date, timeZone = SHOP_TIME_ZONE) {
  const sunday = shopClock(at, timeZone).weekday === "Sun";
  const opens = sunday ? hours.sundayOpensAt : hours.weekdayOpensAt;
  const closes = sunday ? hours.sundayClosesAt : hours.weekdayClosesAt;
  if (opens === closes) return sunday ? "not at all on a Sunday" : "not at all today";
  return `${clockLabel(opens)} to ${clockLabel(closes)}`;
}

/**
 * Why a liquor store may not ring up this basket, or null when it may.
 *
 * One function for the till and the server: the till asks before it adds a
 * line, and the sale and offline-replay routes ask again, against the moment
 * the sale was made rather than the moment it reached the server — a sale rung
 * at 21:55 and synced at 22:10 was legal.
 *
 * Only age-restricted lines are refused. A shop out of licence hours still
 * sells bread and airtime.
 */
export function liquorSaleRefusal(input: {
  profile: Pick<ShopProfile, "businessType"> & ShopSwitches & ShopHours;
  ageRestricted: readonly string[];
  idChecked: boolean;
  at: Date;
  timeZone?: string;
}): string | null {
  if (input.ageRestricted.length === 0) return null;
  const features = shopFeatures(input.profile);
  const what = input.ageRestricted.length === 1 ? input.ageRestricted[0] : "alcohol";
  if (features.licenceHours && !isWithinLicenceHours(input.profile, input.at, input.timeZone)) {
    const subject = what.charAt(0).toUpperCase() + what.slice(1);
    return `${subject} can't be sold now. The licence allows ${licenceWindowLabel(input.profile, input.at, input.timeZone)}.`;
  }
  if (features.ageCheck && !input.idChecked) {
    return `Check the customer's ID before selling ${what}.`;
  }
  return null;
}

/**
 * A licence window as a person writes it: "08:00 to 22:00" → opens and
 * closes, or null when it is not two 24-hour times joined by "to". A window
 * may run past midnight (a bar open 10:00 to 01:00), so the order is free.
 */
export function parseHoursWindow(text: string): { opens: string; closes: string } | null {
  const match = /^\s*(\d{1,2}:\d{2})\s*(?:to|-|–)\s*(\d{1,2}:\d{2})\s*$/i.exec(text);
  if (!match) return null;
  const pad = (hhmm: string) => hhmm.padStart(5, "0");
  const opens = pad(match[1]!);
  const closes = pad(match[2]!);
  return HHMM.test(opens) && HHMM.test(closes) ? { opens, closes } : null;
}

/** "08:00", "22:00" → "08:00 to 22:00". */
export function hoursWindowText(opens: string, closes: string): string {
  return `${opens} to ${closes}`;
}
