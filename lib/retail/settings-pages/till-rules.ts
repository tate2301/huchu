import { z } from "zod";

import {
  cleanReasons,
  discountProblem,
  hoursWords,
  offlineHoursProblem,
  parseHours,
  parsePercent,
  percentWords,
  reasonsProblem,
  VOID_PIN_LABELS,
} from "@/lib/retail/till-rule-words";

import type { SettingsPage } from "./types";

/**
 * Setup › Till rules (`/retail/manage/till-rules`, board TillRules, W-64):
 * when a refund, a void, a discount or the drawer needs a manager's PIN, the
 * reasons a cashier picks from, how a sale is paid, the cash-drop prompt and
 * how long a till sells offline (10-setup 5.7). Owners and managers change
 * it; the bookkeeper reads it. The server enforces every rule
 * (`lib/retail/till-rules.ts`).
 */

const onOff = z.boolean({ message: "Turn it on or off." });

function moneyRule(label: string) {
  return z
    .string({ message: `Type ${label}.` })
    .transform((value) => value.trim().replace(/,/g, ""))
    .superRefine((value, ctx) => {
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) ctx.addIssue({ code: "custom", message: "Type an amount, like 20.00." });
    })
    .transform((value) => Number(value).toFixed(2));
}

function reasonsRule() {
  return z
    .array(z.string(), { message: "Add a reason." })
    .transform(cleanReasons)
    .superRefine((value, ctx) => {
      const problem = reasonsProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    });
}

/** A value typed as words ("10%", "24 hours"), checked, then written the way the page shows it. */
function textRule(problemOf: (text: string) => string | null, words: (text: string) => string) {
  return z
    .string()
    .superRefine((value, ctx) => {
      const problem = problemOf(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    })
    .transform(words);
}

export const tillRulesPage: SettingsPage = {
  title: "Till rules",
  read: ["retail.till-rules", "view"],
  change: ["retail.till-rules", "update"],
  whoCanChange: "Owners and managers.",
  sections: [
    {
      title: "Refunds and voids",
      fields: [
        { id: "refundPinOver", t: "money", l: "Manager PIN for refunds over", half: true, cur: "US$" },
        { id: "voidPin", t: "seg", l: "Voids need a manager PIN", half: true, o: [...VOID_PIN_LABELS] },
        { id: "refundReasons", t: "tags", l: "Refund reasons", p: "Add a reason, then Enter", keepOne: true },
        { id: "voidReasons", t: "tags", l: "Void reasons", p: "Add a reason, then Enter", keepOne: true },
      ],
    },
    {
      title: "Paying",
      fields: [
        {
          id: "splitTender",
          t: "toggle",
          l: "Split a sale across tenders",
          h: "For example US$10 cash and the rest on EcoCash.",
        },
        {
          id: "referenceRequired",
          t: "toggle",
          l: "Card and EcoCash need a reference",
          h: "The cashier types the slip or confirmation number.",
        },
        {
          id: "maxCashierDiscountPercent",
          t: "text",
          l: "Largest discount a cashier can give",
          half: true,
          mono: true,
          h: "More needs a manager PIN.",
        },
      ],
    },
    {
      title: "The drawer",
      fields: [
        {
          id: "drawerOpenWithoutSale",
          t: "toggle",
          l: "Open the drawer without a sale",
          h: "Off: the drawer only opens on a sale or with a manager PIN.",
        },
        {
          id: "cashDropPromptOver",
          t: "money",
          l: "Ask for a cash drop above",
          half: true,
          cur: "US$",
          h: "The till prompts the cashier to drop to the safe.",
        },
      ],
    },
    {
      title: "Offline",
      fields: [
        {
          id: "offlineHours",
          t: "text",
          l: "Keep selling offline for up to",
          half: true,
          mono: true,
          h: "Receipts queue and send when the till is back online.",
        },
      ],
    },
  ],
  aside: [
    {
      title: "Why these matter",
      bullets: [
        "Refunds and voids are where cash goes missing. A PIN and a reason make every one traceable.",
        "Reasons show in Insights › Losses, so you can see which cashier refunds most and why.",
      ],
    },
    { title: "Who can change this", text: "Owners and managers." },
  ],
  schema: z.object({
    refundPinOver: moneyRule("the refund limit"),
    voidPin: z.enum(VOID_PIN_LABELS, { message: "Choose always, after 5 minutes or never." }),
    refundReasons: reasonsRule(),
    voidReasons: reasonsRule(),
    splitTender: onOff,
    referenceRequired: onOff,
    maxCashierDiscountPercent: textRule(discountProblem, (text) => percentWords(parsePercent(text)!)),
    drawerOpenWithoutSale: onOff,
    cashDropPromptOver: moneyRule("the cash drop amount"),
    offlineHours: textRule(offlineHoursProblem, (text) => hoursWords(parseHours(text)!)),
  }),
};
