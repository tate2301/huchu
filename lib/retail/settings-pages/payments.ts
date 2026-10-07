import { z } from "zod";

import {
  merchantCodeProblem,
  RATE_BY_HAND,
  RATE_RBZ_DAILY,
  rateChangedLine,
  rateSetHint,
  ZIG_ROUNDING,
  zigRateProblem,
} from "@/lib/retail/payment-words";

import type { SettingsPage } from "./types";

/**
 * Setup › Payments (`/retail/manage/payments`, board PaymentsSettings, W-05):
 * the tenders the shop takes, today's ZiG rate and how ZiG change is
 * rounded, and its EcoCash merchant (10-setup 5.6).
 *
 * The owner changes everything; the manager changes the rate and how it is
 * updated only (`retail.zig-rate`, its own action); the bookkeeper reads it. A
 * new rate is a `CurrencyRate` row of its own (the history is kept, the newest
 * applies), so the save bar says "Rate changed by …" while it is the latest change.
 */

const onOff = z.boolean({ message: "Turn it on or off." });

export const TENDER_FIELD_IDS = [
  "cashUsd",
  "cashZig",
  "card",
  "ecocash",
  "innbucks",
  "bankTransfer",
  "onAccount",
  "vouchers",
] as const;

export const ZIG_RATE_FIELDS = ["zigRate", "zigSource"];

export const paymentsPage: SettingsPage = {
  title: "Payments",
  read: ["retail.payments", "view"],
  change: ["retail.payments", "update"],
  // The rate keeps its own endpoint (C-14); managers change it too.
  action: { fields: ZIG_RATE_FIELDS, endpoint: "/api/v2/retail/payments/zig-rate", can: ["retail.zig-rate", "update"] },
  whoCanChange: "Owners and managers.",
  sections: [
    {
      title: "What you take",
      fields: [
        {
          id: "cashUsd",
          t: "toggle",
          l: "Cash, US dollars",
          h: "Change is given in US dollars, then ZiG for anything under US$1.",
        },
        { id: "cashZig", t: "toggle", l: "Cash, ZiG", h: "At today’s rate, below." },
        { id: "card", t: "toggle", l: "Card", h: "On the swipe machine. The cashier types the slip reference." },
        {
          id: "ecocash",
          t: "toggle",
          l: "EcoCash",
          // No EcoCash feed confirms a payment: the cashier types its confirmation code (98-decisions, honest version).
          h: (values) =>
            typeof values.ecocashMerchantCode === "string" && values.ecocashMerchantCode.trim()
              ? `Merchant ${values.ecocashMerchantCode.trim()}. The cashier types the confirmation code.`
              : "Add your merchant code below.",
        },
        { id: "innbucks", t: "toggle", l: "InnBucks" },
        { id: "bankTransfer", t: "toggle", l: "Bank transfer", h: "Held until the transfer shows in the bank." },
        {
          id: "onAccount",
          t: "toggle",
          l: "On account",
          // The till cannot take a customer's account until CUS-10; it leaves this tender off and the server refuses it.
          h: "For customers with an approved account and limit. Not offered at the till yet.",
        },
        { id: "vouchers", t: "toggle", l: "Vouchers" },
      ],
    },
    {
      title: "ZiG rate",
      when: ["cashZig", true],
      fields: [
        {
          id: "zigRate",
          t: "money",
          l: "US$1 is",
          half: true,
          cur: "ZiG",
          decimals: 4,
          // While the RBZ's daily rate is chosen the feed sets it.
          disabled: (values) => values.zigSource === RATE_RBZ_DAILY,
        },
        {
          id: "zigSource",
          t: "seg",
          l: "Updated",
          half: true,
          // "Daily, RBZ rate" only once a feed is configured (10-setup W-05).
          o: (values) => (values.rbzAvailable === true ? [RATE_BY_HAND, RATE_RBZ_DAILY] : [RATE_BY_HAND]),
        },
        {
          id: "zigRounding",
          t: "seg",
          l: "Round ZiG change to",
          o: ZIG_ROUNDING.map((option) => option.label),
          h: (values) =>
            rateSetHint(
              typeof values.zigSetAt === "string" ? values.zigSetAt : null,
              typeof values.zigSetBy === "string" ? values.zigSetBy : null,
              new Date(),
            ),
        },
      ],
    },
    {
      title: "EcoCash",
      when: ["ecocash", true],
      fields: [
        { id: "ecocashMerchantCode", t: "text", l: "EcoCash merchant code", half: true, mono: true, opt: true, optQuiet: true },
        {
          id: "ecocashDisplayName",
          t: "text",
          l: "Shows customers as",
          half: true,
          mono: true,
          upper: true,
          opt: true,
          optQuiet: true,
        },
      ],
    },
  ],
  aside: [
    {
      title: "At the till",
      text: "Tenders show in this order on the payment screen. Anything off here is hidden from cashiers.",
    },
    {
      title: "Where the money goes",
      text: "Each tender posts to an account in the books.",
      link: { label: "Posting to the books", href: "/retail/manage/posting" },
    },
    { title: "Who can change this", text: "Owners and managers." },
  ],
  schema: z.object({
    ...Object.fromEntries(TENDER_FIELD_IDS.map((id) => [id, onOff])),
    zigRate: z.string().superRefine((value, ctx) => {
      const problem = zigRateProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
    zigSource: z.enum([RATE_BY_HAND, RATE_RBZ_DAILY], { message: "Choose by hand or the RBZ rate." }),
    zigRounding: z.enum(ZIG_ROUNDING.map((option) => option.label) as [string, ...string[]], {
      message: "Choose 0.50, 1 or 5.",
    }),
    ecocashMerchantCode: z
      .string()
      .transform((value) => value.trim())
      .superRefine((value, ctx) => {
        const problem = merchantCodeProblem(value);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
    ecocashDisplayName: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .refine((value) => value.length <= 30, "Keep it to 30 characters."),
  }),
  lastChangedLine: (lastChanged, now) =>
    lastChanged.what === "rate" ? rateChangedLine(lastChanged.by, lastChanged.at, now) : null,
};
