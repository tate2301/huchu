import { dayKey, formatMoney, formatShortDay, formatSigned } from "@/lib/workspace/format";

/**
 * What the sign-off sheet, the record and the server say about a drawer that
 * closed out (50-floor W-40, FLR-05). Kept apart from `sign-off.ts` so the
 * browser can read them without the server's imports.
 */

export const OWN_DRAWER = "Somebody else signs off your own drawer.";

export type SignOffOutcome = "ACCEPT" | "RECOVER" | "LOOK_INTO";

/** The three cards, in the board's order; Recover is drawn only for a short drawer. */
export const SIGN_OFF_CARDS: Array<{ label: string; sub: (first: string) => string; outcome: SignOffOutcome }> = [
  { label: "Accept it", sub: () => "Written off to Cash differences.", outcome: "ACCEPT" },
  { label: "Recover from the cashier", sub: (first) => `Owed to the shop by ${first}, with their agreement noted.`, outcome: "RECOVER" },
  { label: "Look into it", sub: () => "Stays open on the overview until you decide.", outcome: "LOOK_INTO" },
];

type Drawer = { countedCash: number | null; variance: number | null; expectedCash: number | null };

const uncounted = (drawer: Drawer) => drawer.countedCash === null || drawer.variance === null;

/** "Sign off a short drawer" / "… an over drawer" / "… a drawer nobody counted". */
export function signOffTitle(drawer: Drawer): string {
  if (uncounted(drawer)) return "Sign off a drawer nobody counted";
  return drawer.variance! > 0 ? "Sign off an over drawer" : "Sign off a short drawer";
}

/** Difference: "−US$20.00 short", "+US$3.17 over", "Not counted". */
export function signOffDifference(drawer: Drawer): string {
  if (uncounted(drawer)) return "Not counted";
  return `${formatSigned(drawer.variance!)} ${drawer.variance! < 0 ? "short" : "over"}`;
}

/** Counted: "US$412.50 against US$432.50 expected", "Nothing counted against US$72.95 expected". */
export function signOffCounted(drawer: Drawer): string {
  const expected = formatMoney(drawer.expectedCash ?? 0);
  return uncounted(drawer) ? `Nothing counted against ${expected} expected` : `${formatMoney(drawer.countedCash!)} against ${expected} expected`;
}

/** The day the drawer closed: "today", "yesterday", else "30 Sep". */
export function signOffDay(closedAt: string, now: Date = new Date()): string {
  const day = dayKey(new Date(closedAt));
  if (day === dayKey(now)) return "today";
  if (day === dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return "yesterday";
  return formatShortDay(closedAt);
}

/** The toast once it is signed off. */
export function signOffDone(result: { shiftNo: string; outcome: SignOffOutcome; amount: string | null }, cashierName: string): string {
  const figure = result.amount === null ? null : formatMoney(Math.abs(Number(result.amount)));
  if (result.outcome === "LOOK_INTO") return `${result.shiftNo} stays on the overview while you look into it.`;
  if (result.outcome === "RECOVER") return `${result.shiftNo} signed off. ${figure} to be recovered from ${cashierName}.`;
  return figure ? `${result.shiftNo} signed off. ${figure} written off to cash differences.` : `${result.shiftNo} signed off.`;
}
