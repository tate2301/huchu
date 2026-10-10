/**
 * What every printed slip shares: the shop's top lines and numbers, the date
 * as it prints, a figure without the currency, and a line's deposit row. The
 * receipt page (`app/portal/pos/receipt`) and the slip a till prints for a
 * sale it saved offline (`offline-slip.tsx`) both read from here, so the two
 * papers cannot say the shop differently. No hooks: the receipt renders it on
 * the server.
 */

import { receiptTextLines, type ReceiptWire } from "@/lib/retail/receipt-words";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import { count, hhmm, usd } from "./format";

/** A figure without the currency: a receipt prints "US$" on the total only. */
export function receiptFigure(value: number): string {
  return usd(value).replace("US$", "");
}

const datePart = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  // The shop's own clock, as every till time is read.
  timeZone: SHOP_TIME_ZONE,
});

/** "Fri 2 Oct 19:42", in Harare. */
export function receiptStamp(when: string | Date): string {
  return `${datePart.format(new Date(when))} ${hhmm(when)}`;
}

/**
 * The deposit row under a line: "Deposit, 6 bottles". `each` is one bottle's
 * deposit; without it the row says only "Deposit".
 */
export function depositRowLabel(deposit: number, each: number | null | undefined): string {
  const bottles = each ? Math.round(Math.abs(deposit) / each) : 0;
  return bottles ? `Deposit, ${count(bottles, "bottle")}` : "Deposit";
}

/** The shop's top lines, its VAT number and, on a liquor store, its licence, as the receipt settings say. */
export function ReceiptHead({ wire }: { wire: ReceiptWire }) {
  const head = receiptTextLines(wire.header);
  const numbers = [
    wire.showVatNumber && wire.vatNumber ? `VAT ${wire.vatNumber}` : null,
    wire.liquor && wire.showLicenceNumber && wire.licenceNumber ? `Liquor licence ${wire.licenceNumber}` : null,
  ].filter((line): line is string => Boolean(line));
  const logoUrl = wire.printLogo ? wire.logoUrl : null;
  return (
    <div className="c">
      {logoUrl ? (
        // The shop's name is the first line under it, so the logo is decorative.
        // eslint-disable-next-line @next/next/no-img-element -- the tenant's uploaded logo, any origin
        <img src={logoUrl} alt="" className="receipt-logo" />
      ) : null}
      {head.map((line, index) => (
        <div key={`h${index}`} className={index === 0 ? "t" : undefined}>
          {line}
        </div>
      ))}
      {numbers.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

/** The shop's bottom lines, under a rule; nothing when it has none. */
export function ReceiptFoot({ wire }: { wire: ReceiptWire }) {
  const foot = receiptTextLines(wire.footer);
  if (foot.length === 0) return null;
  return (
    <>
      <hr />
      {foot.map((line, index) => (
        <div key={`f${index}`} className="c">
          {line}
        </div>
      ))}
    </>
  );
}
