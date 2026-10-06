import { z } from "zod";

import { BUSINESS_TYPE_LABELS } from "@/lib/retail/shop-profile-rules";
import { parseDay } from "@/lib/workspace/format";

import type { SettingsPage } from "./types";

/**
 * Setup › Shop (`/retail/manage/company`, board CompanySettings): what kind
 * of shop it is, the liquor store's features and its licence, the business it
 * trades as, and its money (00-foundations 5.10.3, 98-decisions "Owner
 * direction, 5 October" items 2–4).
 *
 * The business's names, numbers and logo are Management's (Branding): they
 * show here as `read`, with a link to where they change. Money changes here
 * (98-decisions, Foundations 11): the currency prices are in, until the first
 * sale is recorded in it, and the month the financial year starts.
 *
 * The page also carries three values onboarding and Sites set and nothing on
 * this board draws (SET-01): the shop's WhatsApp number, whether it is
 * registered for VAT, and its default site.
 */

export const GENERAL_RETAIL = BUSINESS_TYPE_LABELS.GENERAL;
export const LIQUOR_STORE = BUSINESS_TYPE_LABELS.LIQUOR;

/** "1 January" … "1 December": when the financial year starts. */
export const YEAR_STARTS = Array.from(
  { length: 12 },
  (_, index) =>
    `1 ${new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(Date.UTC(2000, index, 1))}`,
);

export const PRICE_CURRENCIES = ["US$", "ZiG"] as const;

/** The Money field's sentence once a sale is recorded in the shop's currency. */
export function pricesLockedHint(currency: unknown): string {
  return `Prices stay in ${currency === "ZiG" ? "ZiG" : "US$"} because sales are recorded in it.`;
}

/** A phone number as typed ("+263 77 412 0098"), checked as E.164 once spaces and dashes go. */
export function isPhoneNumber(value: string): boolean {
  return /^\+[1-9][0-9]{7,14}$/.test(value.replace(/[\s()-]/g, ""));
}

export const companyPage: SettingsPage = {
  title: "Shop",
  read: ["retail.company", "view"],
  change: ["retail.company", "update"],
  whoCanChange: "Owners only. Every change shows in Activity with who made it.",
  // A product record's "Break a case" and its liquor details follow these switches.
  invalidates: [["retail-product"]],
  sections: [
    {
      title: "Business type",
      fields: [
        {
          id: "businessType",
          t: "cards",
          l: "Business type",
          nolabel: true,
          o: [
            [GENERAL_RETAIL, "Groceries, hardware, clothing: anything sold by the unit."],
            [LIQUOR_STORE, "Beer, wine and spirits. Age checks, licence hours, empties and cases."],
            ["Pharmacy", "Prescriptions, batches and expiry dates.", "Soon"],
            ["Restaurant and bar", "Tables, tabs and the kitchen.", "Soon"],
          ],
          h: "It sets the categories and starter catalogue you begin with, and the features below. Products, prices and sales are never changed by switching.",
        },
      ],
    },
    {
      title: "Liquor store features",
      when: ["businessType", LIQUOR_STORE],
      note: {
        text: "Licence hours are kept for each site, day by day.",
        link: { label: "Set them in Sites", href: "/retail/manage/sites" },
      },
      fields: [
        {
          id: "ageCheck",
          t: "toggle",
          l: "Age check at the till",
          h: "The till asks the cashier to check ID before it sells anything in a category marked 18+.",
        },
        {
          id: "licenceHours",
          t: "toggle",
          l: "Licence trading hours",
          h: "The till stops selling alcohol outside each site's licence hours. Soft drinks and snacks still sell.",
        },
        {
          id: "emptiesAndDeposits",
          t: "toggle",
          l: "Empties and deposits",
          h: "Charge a deposit on returnable bottles and crates, refund it when they come back, and claim it from the supplier.",
        },
        {
          id: "casesAndSingles",
          t: "toggle",
          l: "Cases and singles",
          h: "Sell a whole case or break it into singles. Stock is counted in singles.",
        },
        { id: "licenceNumber", t: "text", l: "Liquor licence number", half: true, mono: true },
        { id: "licenceExpiresOn", t: "text", l: "Licence expires", half: true, p: "31 December 2026" },
      ],
    },
    {
      title: "The business",
      note: {
        text: "Kept with your branding in Management.",
        link: { label: "Change them", href: "/preferences/organization/branding/identity" },
      },
      fields: [
        { id: "tradingName", t: "text", l: "Trading name" },
        { id: "legalName", t: "text", l: "Legal name" },
        { id: "registrationNumber", t: "text", l: "Registration number", half: true, mono: true },
        { id: "vatNumber", t: "text", l: "VAT number", half: true, mono: true },
        { id: "taxNumber", t: "text", l: "Tax number (BP)", half: true, mono: true },
        { id: "phone", t: "text", l: "Phone", half: true, mono: true },
        { id: "email", t: "text", l: "Email" },
        { id: "address", t: "area", l: "Address", rows: 2 },
        { id: "logoUrl", t: "photo", l: "Logo", prompt: "Add your logo", h: "On receipts, orders and statements." },
      ],
    },
    {
      title: "Money",
      fields: [
        {
          id: "currency",
          t: "seg",
          l: "Prices in",
          half: true,
          o: [...PRICE_CURRENCIES],
          disabled: (values) => values.pricesLocked === true,
          h: (values) => (values.pricesLocked === true ? pricesLockedHint(values.currency) : ""),
        },
        { id: "financialYearStarts", t: "text", l: "Financial year starts", half: true, o: YEAR_STARTS },
      ],
    },
  ],
  aside: [
    {
      title: "What the business type changes",
      bullets: [
        "The categories you start with, and whether each needs an age check.",
        "The starter catalogue offered when you add products.",
        "The features on this page, each of which you can turn off.",
        "Nothing you have already sold, bought or priced.",
      ],
    },
    { title: "Who can change this", text: "Owners only. Every change shows in Activity with who made it." },
    {
      title: "More shop types",
      text: "Pharmacy and restaurant and bar are on the way. Tell us what you run and we will tell you when it is ready.",
    },
  ],
  schema: z.object({
    businessType: z.enum([GENERAL_RETAIL, LIQUOR_STORE], { message: "Choose General retail or Liquor store." }),
    ageCheck: z.boolean({ message: "Turn it on or off." }),
    licenceHours: z.boolean({ message: "Turn it on or off." }),
    emptiesAndDeposits: z.boolean({ message: "Turn it on or off." }),
    casesAndSingles: z.boolean({ message: "Turn it on or off." }),
    licenceNumber: z.string().trim().max(40, "Keep it to 40 characters."),
    licenceExpiresOn: z
      .string()
      .refine((value) => value.trim() === "" || parseDay(value) !== null, "Write a date such as 31 December 2026."),
    currency: z.enum(PRICE_CURRENCIES, { message: "Choose US$ or ZiG." }),
    financialYearStarts: z.enum(YEAR_STARTS as [string, ...string[]], { message: "Choose the month it starts." }),
    whatsapp: z
      .string()
      .trim()
      .refine((value) => value === "" || isPhoneNumber(value), "Write the number with its country code, +263 77 412 0098."),
    vatRegistered: z.boolean({ message: "Say yes or no." }),
    defaultSiteId: z.string().uuid("Choose one of your sites.").nullable(),
  }),
  labels: { whatsapp: "WhatsApp", vatRegistered: "Registered for VAT", defaultSiteId: "Default site" },
};
