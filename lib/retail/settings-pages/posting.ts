import { z } from "zod";

import { TENDER_OPTIONS } from "@/lib/retail/payment-words";
import { ROLE_OPTIONS, SCHEDULE_WORDS } from "@/lib/retail/posting-words";
import type { FieldSpec } from "@/lib/workspace/sheet-kind";

import type { SettingsPage } from "./types";

/**
 * Setup › Posting to the books (`/retail/manage/posting`, board
 * PostingSettings, W-65): the account each tender that is on settles into,
 * the account each role posts to, and when the day's sales reach the books
 * (10-setup 5.10). The owner and the bookkeeper change it; nobody else opens it.
 *
 * Every account field lists the tenant's own chart ("{code} {name}", its type
 * under it) and adds one inline ("New account": "Code and name", "Type").
 */

const account = z
  .object({ id: z.string().min(1), label: z.string().optional(), sub: z.string().nullable().optional() }, {
    message: "Choose an account.",
  })
  .passthrough();

const accountField = (id: string, label: string, show?: FieldSpec["show"]): FieldSpec => ({
  id,
  t: "auto",
  l: label,
  half: true,
  noun: "account",
  ...(show ? { show } : {}),
});

const listed = (values: Record<string, unknown>, key: string, id: string) =>
  Array.isArray(values[key]) && (values[key] as unknown[]).includes(id);

export const POSTING_TENDER_FIELDS = TENDER_OPTIONS.map((option) => option.key);
export const POSTING_ROLE_FIELDS = ROLE_OPTIONS.map((option) => option.field);

export const postingPage: SettingsPage = {
  title: "Posting to the books",
  read: ["retail.posting", "view"],
  change: ["retail.posting", "update"],
  whoCanChange: "Owners and the bookkeeper.",
  sections: [
    {
      title: "Where each tender goes",
      // One field per tender that is on (Payments), in the till's order.
      fields: TENDER_OPTIONS.map((option) =>
        accountField(option.key, option.label, (values) => listed(values, "tendersOn", option.key)),
      ),
    },
    {
      title: "Sales and stock",
      // VAT only for a shop registered for VAT; deposits only for a liquor store with empties on.
      fields: ROLE_OPTIONS.map((option) =>
        accountField(option.field, option.label, (values) => listed(values, "rolesShown", option.field)),
      ),
    },
    {
      title: "When",
      fields: [
        { id: "schedule", t: "seg", l: "Post", o: [SCHEDULE_WORDS.END_OF_DAY, SCHEDULE_WORDS.EVERY_SALE] },
        { id: "lastPosted", t: "read", l: "Last posted" },
      ],
    },
  ],
  aside: [
    {
      title: "Starting from nothing",
      text: "Sets up the accounts, VAT codes and tender accounts a shop needs, with the ZiG and rand rates. It lists what it will add before it adds anything.",
      slot: "setup",
    },
    { title: "Ready to post", slot: "checks" },
    { title: "Who can change this", text: "Owners and the bookkeeper." },
  ],
  schema: z.object({
    ...Object.fromEntries([...POSTING_TENDER_FIELDS, ...POSTING_ROLE_FIELDS].map((id) => [id, account])),
    schedule: z.enum([SCHEDULE_WORDS.END_OF_DAY, SCHEDULE_WORDS.EVERY_SALE], {
      message: "Choose the end of each day or every sale.",
    }),
  }),
};
