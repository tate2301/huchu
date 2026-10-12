/**
 * The liquor store's till moments (Liquor board, ADM-08 §5.11, built by
 * FLR-10 per C-27), as pure rules the screens and the tests share: the age
 * check, the licence hours' banner, and a case opened when singles run out.
 * Each only while its shop switch is on (`devices/me` shop features).
 */

import { fetchJson } from "@/lib/api-client";
import { clockLabel, harareClock, type AlcoholVerdict } from "@/lib/retail/licence-hours";
import type { CartItem, PosCatalogItem } from "./types";

/* ── Age check (panel 1) ─────────────────────────────────────────────── */

/**
 * Whether adding this product asks for an ID: the first age-restricted line
 * of a sale does, while the switch is on and nobody has answered yet. Later
 * restricted lines in the same sale do not ask; a new sale asks again.
 */
export function asksForId(input: { ageCheckOn: boolean; idChecked: boolean; cart: readonly Pick<CartItem, "ageRestricted">[]; item: Pick<PosCatalogItem, "ageRestricted"> }) {
  return input.ageCheckOn && input.item.ageRestricted && !input.idChecked && !input.cart.some((line) => line.ageRestricted);
}

/** "Johnnie Walker Black 750ml is in Spirits, which needs an ID check." */
export function ageCheckSentence(product: string, category: string | null): string {
  return category ? `${product} is in ${category}, which needs an ID check.` : `${product} needs an ID check.`;
}

export const AGE_CHECK_FOOTNOTE = "Asked once a sale. Logged with the cashier’s name.";

/* ── Licence hours (panel 2) ─────────────────────────────────────────── */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "on weekdays", "on Saturdays", "on Sundays and public holidays". */
function whichDays(weekday: number) {
  if (weekday === 0) return "on Sundays and public holidays";
  if (weekday === 6) return "on Saturdays";
  return "on weekdays";
}

/**
 * The banner over the shelf while 18+ products may not sell, and the toast a
 * tap on one of them repeats. Before the day's window opens it says when it
 * does; after it closes, when it stopped. Null while alcohol sells.
 */
export function licenceSentence(verdict: AlcoholVerdict, at: Date): string | null {
  if (verdict.sellable) return null;
  const { weekday, minutes } = harareClock(at);
  if (verdict.startsAt !== null && minutes < verdict.startsAt) {
    return `Alcohol sells from ${clockLabel(verdict.startsAt)}. Soft drinks and snacks sell now.`;
  }
  return `Alcohol stops at ${clockLabel(verdict.stoppedAt)} ${whichDays(weekday)}. Soft drinks and snacks still sell.`;
}

/** "Front till · Monday 22:04": the eyebrow over the banner, on Harare's clock. */
export function licenceEyebrow(till: string, at: Date): string {
  const { weekday, minutes } = harareClock(at);
  return `${till} · ${DAY_NAMES[weekday]} ${clockLabel(minutes)}`;
}

/** What a restricted product shows in place of its price outside the hours. */
export const NOT_SOLD = "Not sold";

/* ── Cases and singles (panel 4) ─────────────────────────────────────── */

export type CaseMoment = { kind: "none" } | { kind: "break" } | { kind: "ask" };

/**
 * Adding one more single: when the shelf holds none (`stock`, the line's
 * own once it is on the sale) and a case of it is in this branch, a case
 * opens first. A case set to "Break cases at the till" opens at once; any
 * other asks ("No singles left"). Singles still on the shelf sell first: the
 * server opens no case at the till while one is left.
 */
export function caseMoment(input: { casesAndSingles: boolean; openableCase: PosCatalogItem["openableCase"]; stock: number }): CaseMoment {
  const pack = input.openableCase;
  if (!input.casesAndSingles || !pack || pack.casesOnHand < 1) return { kind: "none" };
  if (input.stock >= 1) return { kind: "none" };
  return pack.breakAtTill ? { kind: "break" } : { kind: "ask" };
}

/** "Castle Lager 340ml shows 0 singles but 4 cases. Open a case?" */
export function noSinglesSentence(single: string, casesOnHand: number): string {
  return `${single} shows 0 singles but ${casesOnHand} ${casesOnHand === 1 ? "case" : "cases"}. Open a case?`;
}

/** "1 case off, 24 singles on. Automatic if Break cases at the till is on." */
export function caseFootnote(unitsPerCase: number): string {
  return `1 case off, ${unitsPerCase} singles on. Automatic if Break cases at the till is on.`;
}

/** "Opened 1 case of Castle Lager 340ml. 24 singles on." */
export function caseOpenedToast(single: string, singles: number): string {
  return `Opened 1 case of ${single}. ${singles} singles on.`;
}

/**
 * Opens one case at the till's branch (STK-04's break): the case out, its
 * singles in. A cashier may only while the singles have run out, on her open
 * shift there; the server judges it. Answers the singles now on hand.
 */
export async function breakOneCase(caseProductId: string, siteId: string | null): Promise<number> {
  const result = await fetchJson<{ data: { singleOnHand: number } }>("/api/v2/retail/stock/case-breaks", {
    method: "POST",
    body: JSON.stringify({ caseProductId, ...(siteId ? { siteId } : {}), cases: 1 }),
  });
  return result.data.singleOnHand;
}
