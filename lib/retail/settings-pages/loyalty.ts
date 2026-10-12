import { z } from "zod";

import { earnWords, pointValueWords, pointsWords } from "@/lib/retail/loyalty/format";
import { parseTier, sortTiers, TIER_WRONG, tierTag } from "@/lib/retail/loyalty/tiers";
import { formatCount } from "@/lib/workspace/format";
import type { SheetValues } from "@/lib/workspace/sheet-kind";

import type { SettingsPage } from "./types";

/**
 * Setup › Loyalty (`/retail/manage/loyalty`, board LoyaltySettings, W-48):
 * what a customer earns at the till, what a point is worth, when points may
 * be spent and when they expire, the tiers, and the rules. Owners change it;
 * managers read it. The aside's "Last 30 days" is read off the points ledger
 * (`lib/retail/settings/loyalty.ts`).
 */

export const WHO_CAN_CHANGE_LOYALTY = "Owners only.";
export const EARN_WRONG = "Write it as “1 point for each US$1”.";
export const WORTH_WRONG = "Write what a point is worth, such as 0.01.";
export const MIN_WRONG = "Write it as “500 points”.";
export const FIRST_TIER_FROM_NOTHING = "The first tier starts at US$0.";
export const TOP_TIER_EARNS_LESS = "The top tier earns at least what everyone earns.";
export const EXPIRY_WORDS = { NEVER: "Never", AFTER_12_MONTHS: "After 12 months" } as const;

/** The first number in the words: "1.5 points for each US$1" → 1.5; null when there is none. */
export function firstNumber(text: string): number | null {
  const match = /(\d[\d,]*(?:\.\d+)?)/.exec(text);
  return match ? Number(match[1]!.replace(/,/g, "")) : null;
}

const decimals = (text: string) => (/\.(\d+)/.exec(text)?.[1]?.length ?? 0);

/** "1 point for each US$1": a rate from 0.01 to 100, two decimals at most, written back in the board's words. */
const earnRule = z
  .string({ message: EARN_WRONG })
  .transform((text, ctx) => {
    const raw = /(\d[\d,]*(?:\.\d+)?)/.exec(text)?.[1]?.replace(/,/g, "") ?? null;
    const rate = raw === null ? null : Number(raw);
    if (raw === null || rate === null || decimals(raw) > 2 || rate < 0.01 || rate > 100) {
      ctx.addIssue({ code: "custom", message: EARN_WRONG });
      return z.NEVER;
    }
    return earnWords(rate);
  });

/** "0.01": what a point is worth in US$, 0.0001 to 1.0000. */
const worthRule = z
  .string({ message: WORTH_WRONG })
  .transform((text, ctx) => {
    const trimmed = text.trim().replace(/^US\$\s*/i, "");
    const value = Number(trimmed);
    if (!/^\d*\.?\d+$/.test(trimmed) || decimals(trimmed) > 4 || value < 0.0001 || value > 1) {
      ctx.addIssue({ code: "custom", message: WORTH_WRONG });
      return z.NEVER;
    }
    return pointValueWords(value);
  });

/** "500 points": a whole number from 0 to 100,000. */
const minRule = z
  .string({ message: MIN_WRONG })
  .transform((text, ctx) => {
    const match = /^\s*(\d[\d,]*)\s*(points?)?\s*$/i.exec(text);
    const value = match ? Number(match[1]!.replace(/,/g, "")) : NaN;
    if (!Number.isInteger(value) || value < 0 || value > 100_000) {
      ctx.addIssue({ code: "custom", message: MIN_WRONG });
      return z.NEVER;
    }
    return pointsWords(value);
  });

/** One to six tiers, each "Silver, from US$500", names apart, the lowest from US$0; kept lowest first. */
const tiersRule = z
  .array(z.string(), { message: TIER_WRONG })
  .transform((tags, ctx) => {
    if (tags.length === 0) {
      ctx.addIssue({ code: "custom", message: "Add a tier, such as “Bronze, from US$0”." });
      return z.NEVER;
    }
    if (tags.length > 6) {
      ctx.addIssue({ code: "custom", message: "Keep to six tiers." });
      return z.NEVER;
    }
    const tiers = tags.map(parseTier);
    if (tiers.some((tier) => tier === null)) {
      ctx.addIssue({ code: "custom", message: TIER_WRONG });
      return z.NEVER;
    }
    const sorted = sortTiers(tiers as NonNullable<(typeof tiers)[number]>[]);
    const names = new Set(sorted.map((tier) => tier.name.toLowerCase()));
    if (names.size !== sorted.length) {
      ctx.addIssue({ code: "custom", message: "Give each tier its own name." });
      return z.NEVER;
    }
    if (sorted[0]!.from !== "0.00") {
      ctx.addIssue({ code: "custom", message: FIRST_TIER_FROM_NOTHING });
      return z.NEVER;
    }
    return sorted.map(tierTag);
  });

/** "Gold" from the tags as they stand, for "Gold earns". */
export function topTierName(values: SheetValues): string {
  const tags = Array.isArray(values.tiers) ? (values.tiers as string[]) : [];
  const tiers = tags.map(parseTier).filter((tier) => tier !== null);
  const sorted = sortTiers(tiers);
  return sorted[sorted.length - 1]?.name ?? "The top tier";
}

/** "So 100 points take US$1 off." */
function worthHint(values: SheetValues): string {
  const value = Number(values.worth);
  if (!Number.isFinite(value) || value <= 0) return "What one point takes off a sale.";
  const points = Math.ceil(1 / value - 1e-9);
  return `So ${formatCount(points)} ${points === 1 ? "point takes" : "points take"} US$1 off.`;
}

type Preview = { customers: number; points: number };

/** Switching Never → After 12 months: what goes tonight. */
function expiryWarns(values: SheetValues): boolean {
  const preview = values.expiryPreview as Preview | undefined;
  return values.exp === EXPIRY_WORDS.AFTER_12_MONTHS && values.expSaved === EXPIRY_WORDS.NEVER && (preview?.points ?? 0) > 0;
}

function expiryHint(values: SheetValues): string {
  if (!expiryWarns(values)) return "";
  const preview = values.expiryPreview as Preview;
  const customers = `${formatCount(preview.customers)} ${preview.customers === 1 ? "customer loses" : "customers lose"}`;
  return `${customers} ${formatCount(preview.points)} points tonight, earned more than 12 months ago.`;
}

export const loyaltyPage: SettingsPage = {
  title: "Loyalty",
  read: ["retail.loyalty", "view"],
  change: ["retail.loyalty", "update"],
  whoCanChange: WHO_CAN_CHANGE_LOYALTY,
  sections: [
    {
      title: "Points",
      fields: [
        {
          id: "on",
          t: "toggle",
          l: "Loyalty points",
          h: "Customers earn at the till when they give their phone number.",
        },
        { id: "earn", t: "text", l: "Earn", mono: true, half: true, p: "1 point for each US$1" },
        { id: "worth", t: "money", l: "A point is worth", half: true, decimals: 4, cur: "US$", h: worthHint },
        { id: "min", t: "text", l: "Spend from", mono: true, half: true, p: "500 points" },
        {
          id: "exp",
          t: "seg",
          l: "Points expire",
          half: true,
          o: [EXPIRY_WORDS.NEVER, EXPIRY_WORDS.AFTER_12_MONTHS],
          h: expiryHint,
          warn: expiryWarns,
        },
      ],
    },
    {
      title: "Tiers",
      fields: [
        { id: "tiers", t: "tags", l: "Tiers, by spend in 12 months", p: "Add a tier, then Enter" },
        {
          id: "gold",
          t: "text",
          l: "Top tier earns",
          lw: (values) => `${topTierName(values)} earns`,
          mono: true,
          p: "1.5 points for each US$1",
        },
      ],
    },
    {
      title: "Rules",
      fields: [
        { id: "promo", t: "toggle", l: "Earn on promotion prices" },
        {
          id: "bday",
          t: "toggle",
          l: "Birthday bonus",
          h: (values) =>
            `${formatCount(typeof values.bdayPoints === "number" ? values.bdayPoints : 200)} points in their birthday week, with a WhatsApp message.`,
        },
        {
          id: "alc",
          t: "toggle",
          l: "Points can pay for alcohol",
          h: "Liquor store. Off where your licence does not allow it.",
          show: (values) => values.liquor === true,
        },
      ],
    },
  ],
  aside: [
    { title: "Last 30 days", slot: "last30" },
    { title: "Who can change this", text: WHO_CAN_CHANGE_LOYALTY },
  ],
  schema: z.object({
    on: z.boolean({ message: "Turn it on or off." }),
    earn: earnRule,
    worth: worthRule,
    min: minRule,
    exp: z.enum([EXPIRY_WORDS.NEVER, EXPIRY_WORDS.AFTER_12_MONTHS], { message: "Choose when points expire." }),
    tiers: tiersRule,
    gold: earnRule,
    promo: z.boolean({ message: "Turn it on or off." }),
    bday: z.boolean({ message: "Turn it on or off." }),
    alc: z.boolean({ message: "Turn it on or off." }),
  }),
};
