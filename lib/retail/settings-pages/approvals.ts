import { z } from "zod";

import { ASK_BY_WORDS, PRICE_CHANGE_WORDS } from "@/lib/retail/approvals/words";

import type { SettingsPage } from "./types";

/**
 * Management › Approvals (`/retail/manage/approvals`, board ApprovalSettings,
 * W-58): when the owner must say yes — requisitions, prices, stock, accounts —
 * who is asked and how (80-admin 5.7). Owners change it; managers and the
 * bookkeeper read it. Every area reads the saved values through
 * `getApprovalLimits` (`lib/retail/approvals/limits.ts`).
 */

export const APPROVAL_MONEY_MAX = 1_000_000;
export const AMOUNT_WRONG = "Write an amount such as 500.00.";
export const PICK_AN_OWNER = "Pick an owner.";
export const CHOOSE_COUNT_RULE = "Choose who approves count differences.";
export const WHO_CAN_CHANGE_APPROVALS = "Owners only.";

/** An amount from 0.00 to 1,000,000.00 with two decimals at most, written back as "500.00". */
const moneyRule = z
  .string({ message: AMOUNT_WRONG })
  .transform((value) => value.trim().replace(/,/g, ""))
  .refine((value) => /^\d{1,7}(\.\d{1,2})?$/.test(value) && Number(value) <= APPROVAL_MONEY_MAX, {
    message: AMOUNT_WRONG,
  })
  .transform((value) => Number(value).toFixed(2));

/**
 * A person picked in "Owner approvals go to", as their id: the picked option
 * the page holds, or a bare id. The store checks they are an active owner and
 * rebuilds the option from the database.
 */
const ownerRule = z
  .union([z.string().min(1), z.object({ id: z.string().min(1) })], { message: PICK_AN_OWNER })
  .transform((value) => (typeof value === "string" ? value : value.id));

export const approvalsPage: SettingsPage = {
  title: "Approvals",
  read: ["retail.approvals", "view"],
  change: ["retail.approvals", "update"],
  whoCanChange: WHO_CAN_CHANGE_APPROVALS,
  sections: [
    {
      title: "Money out",
      fields: [
        {
          id: "requisitionOwnerOver",
          t: "money",
          l: "Requisitions need the owner over",
          half: true,
          h: "Under it, any manager approves.",
        },
        {
          id: "ownerApproverId",
          t: "auto",
          l: "Owner approvals go to",
          half: true,
          noun: "person",
          // Active owners; one added inline is invited as an owner.
          context: { roles: ["OWNER"], role: "OWNER" },
        },
      ],
    },
    {
      title: "Prices",
      fields: [
        { id: "priceChanges", t: "seg", l: "Price changes", o: [PRICE_CHANGE_WORDS.MANAGERS, PRICE_CHANGE_WORDS.OWNER] },
        {
          id: "belowCostNeedsOwner",
          t: "toggle",
          l: "Below cost needs the owner",
          h: "Any price under its cost waits for you.",
        },
      ],
    },
    {
      title: "Stock",
      fields: [
        { id: "adjustmentPinOver", t: "money", l: "Stock adjustments need a manager PIN over", half: true },
        {
          id: "countDifferences",
          t: "seg",
          l: "Count differences",
          half: true,
          // The second segment names the stored amount: "Owner approves over US$100".
          o: (values) => (Array.isArray(values.countDifferencesOptions) ? (values.countDifferencesOptions as string[]) : []),
        },
      ],
    },
    {
      title: "Customers and asking",
      fields: [
        {
          id: "accountOwnerOver",
          t: "money",
          l: "Accounts need the owner over",
          half: true,
          h: "The limit, when opening or raising it.",
        },
        { id: "askBy", t: "seg", l: "Ask by", o: [ASK_BY_WORDS.APP, ASK_BY_WORDS.WHATSAPP_AND_APP] },
      ],
    },
  ],
  aside: [
    { title: "Waiting now", slot: "waiting" },
    { title: "Who can change this", text: WHO_CAN_CHANGE_APPROVALS },
  ],
  schema: z.object({
    requisitionOwnerOver: moneyRule,
    ownerApproverId: ownerRule,
    priceChanges: z.enum([PRICE_CHANGE_WORDS.MANAGERS, PRICE_CHANGE_WORDS.OWNER], {
      message: "Choose who approves price changes.",
    }),
    belowCostNeedsOwner: z.boolean({ message: "Turn it on or off." }),
    adjustmentPinOver: moneyRule,
    // One of the two labels built from the stored amount; the store checks which.
    countDifferences: z.string({ message: CHOOSE_COUNT_RULE }),
    accountOwnerOver: moneyRule,
    askBy: z.enum([ASK_BY_WORDS.APP, ASK_BY_WORDS.WHATSAPP_AND_APP], { message: "Choose how to ask." }),
  }),
};
