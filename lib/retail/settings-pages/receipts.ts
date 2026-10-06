import { z } from "zod";

import { NO_LOGO_HINT, RECEIPT_LINES_MAX, receiptTextLines, receiptTextProblem, SEND_BY_LABELS } from "@/lib/retail/receipt-words";

import type { SettingsPage } from "./types";

/**
 * Setup › Receipts (`/retail/manage/receipts`, board ReceiptSettings, W-07):
 * what every till receipt says at the top and the bottom, which numbers it
 * carries, how many copies print and whether the customer also gets it on
 * WhatsApp or by email (10-setup 5.8). Owners and managers. The aside
 * previews a receipt of the shop's latest sale as the form stands; the
 * header's "Print a test receipt" prints that preview at 80 mm.
 *
 * Read-only values the page loads beside its settings: `liquor`, `logoUrl`,
 * `whatsAppReady`, `emailReady`, the numbers the receipt prints and the
 * `preview` sale.
 */

const onOff = z.boolean({ message: "Turn it on or off." });

/** Four lines of 42 characters at most, kept as typed less trailing spaces. */
function receiptTextRule() {
  return z
    .string({ message: "Type what the receipt says, or leave it empty." })
    .superRefine((value, ctx) => {
      const problem = receiptTextProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    })
    .transform((value) => receiptTextLines(value).join("\n"));
}

/** "Also send by": while the way chosen is not set up, the hint says the receipts wait. */
function sendByHint(values: Record<string, unknown>): string {
  if (values.alsoSendBy === "WhatsApp" && values.whatsAppReady === false) {
    return "WhatsApp is not set up yet, so receipts wait in the outbox until it is.";
  }
  if (values.alsoSendBy === "Email" && values.emailReady === false) {
    return "Email is not set up yet, so receipts wait in the outbox until it is.";
  }
  if (values.alsoSendBy === "WhatsApp") return "To the customer's phone, when the cashier takes it.";
  if (values.alsoSendBy === "Email") return "To the customer's email, when the cashier takes it.";
  return "";
}

export const receiptsPage: SettingsPage = {
  title: "Receipts",
  read: ["retail.receipts", "view"],
  change: ["retail.receipts", "update"],
  whoCanChange: "Owners and managers.",
  sections: [
    {
      title: "What it says",
      fields: [
        { id: "header", t: "area", l: "Top of the receipt", rows: 2, maxRows: RECEIPT_LINES_MAX },
        { id: "footer", t: "area", l: "Bottom of the receipt", rows: 2, maxRows: RECEIPT_LINES_MAX },
        { id: "showVatNumber", t: "toggle", l: "Show the VAT number" },
        {
          id: "showLicenceNumber",
          t: "toggle",
          l: "Show the liquor licence number",
          h: "Liquor store only.",
          show: (values) => values.liquor === true,
        },
        {
          id: "printLogo",
          t: "toggle",
          l: "Print the logo",
          h: (values) =>
            values.logoUrl ? "Slower on most till printers." : NO_LOGO_HINT,
          // No logo to print: the switch is held off, unless it is on and can be turned off.
          disabled: (values) => !values.logoUrl && values.printLogo !== true,
        },
        { id: "copies", t: "seg", l: "Copies", half: true, o: ["1", "2"] },
        {
          id: "alsoSendBy",
          t: "seg",
          l: "Also send by",
          half: true,
          o: [...SEND_BY_LABELS],
          h: sendByHint,
          warn: (values) =>
            (values.alsoSendBy === "WhatsApp" && values.whatsAppReady === false) ||
            (values.alsoSendBy === "Email" && values.emailReady === false),
        },
      ],
    },
  ],
  aside: [
    { title: "Preview", slot: "preview" },
    { title: "Who can change this", text: "Owners and managers." },
  ],
  schema: z.object({
    header: receiptTextRule(),
    footer: receiptTextRule(),
    showVatNumber: onOff,
    showLicenceNumber: onOff,
    printLogo: onOff,
    copies: z.enum(["1", "2"], { message: "Print one copy or two." }),
    alsoSendBy: z.enum(SEND_BY_LABELS, { message: "Choose nothing, WhatsApp or email." }),
  }),
};
