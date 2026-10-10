"use client";

import * as React from "react";

import { ReceiptPaper } from "@/components/retail/receipt-paper";
import { printReceipt } from "@/components/retail/receipt-print";
import { SettingsFrame } from "@/components/settings-frame/settings-frame";
import { Button } from "@/components/workspace/button";
import {
  receiptDoc,
  sendByOf,
  type ReceiptContent,
  type ReceiptDoc,
  type ReceiptWire,
} from "@/lib/retail/receipt-words";

/**
 * Setup › Receipts (W-07, board ReceiptSettings): what every till receipt
 * says at the top and the bottom, the numbers it carries, the copies and
 * whether the customer also gets it, on the SettingsFrame. The aside's
 * preview is the shop's latest sale as the form stands, changing as you
 * type; "Print a test receipt" prints that preview at 80 mm, writing
 * nothing. Owners and managers.
 */
export default function ReceiptsSettingsPage() {
  return (
    <SettingsFrame
      page="receipts"
      actions={(values) => <PrintTestReceipt doc={previewDoc(values)} copies={values.copies === "2" ? 2 : 1} />}
      slots={(values) => {
        const doc = previewDoc(values);
        return { preview: doc ? <ReceiptPaper doc={doc} /> : null };
      }}
    />
  );
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);

/** The receipt the form describes now, on the sale the server chose to preview. */
function previewDoc(values: Record<string, unknown>): ReceiptDoc | null {
  const preview = values.preview as ReceiptContent | undefined;
  if (!preview || !Array.isArray(preview.lines)) return null;
  const wire: ReceiptWire = {
    header: text(values.header),
    footer: text(values.footer),
    showVatNumber: values.showVatNumber === true,
    showLicenceNumber: values.showLicenceNumber === true,
    printLogo: values.printLogo === true,
    copies: values.copies === "2" ? 2 : 1,
    alsoSendBy: sendByOf(text(values.alsoSendBy)) ?? "NOTHING",
    vatNumber: textOrNull(values.vatNumber),
    licenceNumber: textOrNull(values.licenceNumber),
    logoUrl: textOrNull(values.logoUrl),
    liquor: values.liquor === true,
    currency: preview.currency,
  };
  return receiptDoc(wire, preview);
}

/** The header's "Print a test receipt": the preview, in the browser's print dialog at 80 mm. */
function PrintTestReceipt({ doc, copies }: { doc: ReceiptDoc | null; copies: number }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      disabled={!doc}
      busy={busy}
      onClick={() => {
        if (!doc) return;
        setBusy(true);
        void printReceipt(doc, copies).finally(() => setBusy(false));
      }}
    >
      Print a test receipt
    </Button>
  );
}
