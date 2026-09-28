/**
 * Prints the Corelith logo as text.
 *
 *   pnpm brand:ascii-logo --style text --part mark --columns 58
 *
 * `--style text` is the receipt chain: the shield is made of the code that
 * builds and hashes a ZIMRA fiscal receipt, and the base it stands on is the
 * chain that code produces — each hash signed into the receipt after it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  centsFromMinorUnits,
  hashReceiptInput,
} from "../../lib/accounting/fdms-receipt-signing";
import { renderAsciiLogo, type AsciiStyle, type LogoPart } from "../../lib/platform/ascii-logo";

const { values } = parseArgs({
  options: {
    style: { type: "string", default: "text" },
    part: { type: "string", default: "mark" },
    columns: { type: "string", default: "58" },
  },
});

/** `buildReceiptCanonicalString` and `hashReceipt`, without their comments. */
function receiptChainSource(): string {
  const source = readFileSync(resolve(__dirname, "../../lib/accounting/fdms-receipt-signing.ts"), "utf8");
  return source
    .slice(source.indexOf("export function buildReceiptCanonicalString"), source.indexOf("function decodeHash"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/**
 * A day's first receipts on one sample device, hashed by the real code, each
 * carrying the hash of the one before.
 */
function receiptChainHashes(count = 12): string {
  const hashes: string[] = [];
  let previousReceiptHash: string | null = null;
  for (let n = 1; n <= count; n++) {
    const totalCents = 1_000 + ((n * 7_919) % 48_000);
    // 15.5% VAT, inclusive.
    const taxCents = Math.round((totalCents * 15.5) / 115.5);
    previousReceiptHash = hashReceiptInput({
      deviceId: 21_435,
      receiptType: "FISCALINVOICE",
      receiptCurrency: "USD",
      receiptGlobalNo: n,
      receiptDate: "2026-09-28",
      receiptTotal: centsFromMinorUnits(totalCents),
      taxes: [{ taxId: 1, taxPercent: 15.5, taxAmount: centsFromMinorUnits(taxCents) }],
      previousReceiptHash,
    });
    hashes.push(previousReceiptHash);
  }
  return hashes.join(" ");
}

const code = receiptChainSource();

console.log(
  renderAsciiLogo({
    style: values.style as AsciiStyle,
    part: values.part as LogoPart,
    columns: Number(values.columns),
    fill: { shield: code, base: receiptChainHashes(), wordmark: code },
  }),
);
