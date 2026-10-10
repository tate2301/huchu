import "./receipt-paper.css";

import type { ReceiptDoc } from "@/lib/retail/receipt-words";

/**
 * A receipt drawn on screen as the till prints it (SET-07): Setup ›
 * Receipts' live preview. The printout itself is `receipt-print.ts`, from the
 * same `ReceiptDoc`.
 */
export function ReceiptPaper({ doc, label = "Receipt preview" }: { doc: ReceiptDoc; label?: string }) {
  return (
    <div className="cx-receipt-paper" role="img" aria-label={label}>
      {doc.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the tenant's uploaded logo, any origin
        <img className="cx-receipt-paper__logo" src={doc.logoUrl} alt="" />
      ) : null}
      {doc.head.map((line, index) => (
        <span key={`h${index}`} className={index === 0 ? "cx-receipt-paper__c cx-receipt-paper__title" : "cx-receipt-paper__c"}>
          {line}
        </span>
      ))}
      {doc.numbers.map((line) => (
        <span key={line} className="cx-receipt-paper__c">
          {line}
        </span>
      ))}
      <span className="cx-receipt-paper__rule" />
      {doc.lines.length === 0 ? <span className="cx-receipt-paper__empty">No products yet</span> : null}
      {doc.lines.map((line, index) => (
        <span key={`l${index}`} className="cx-receipt-paper__row">
          <span>{line.label}</span>
          <span>{line.amount}</span>
        </span>
      ))}
      <span className="cx-receipt-paper__rule" />
      <span className="cx-receipt-paper__row cx-receipt-paper__row--total">
        <span>{doc.total.label}</span>
        <span>{doc.total.amount}</span>
      </span>
      {doc.tenders.map((line, index) => (
        <span key={`t${index}`} className="cx-receipt-paper__row">
          <span>{line.label}</span>
          <span>{line.amount}</span>
        </span>
      ))}
      {doc.foot.length > 0 || doc.fiscal ? <span className="cx-receipt-paper__rule" /> : null}
      {doc.foot.map((line, index) => (
        <span key={`f${index}`} className="cx-receipt-paper__c">
          {line}
        </span>
      ))}
      {doc.fiscal ? <span className="cx-receipt-paper__c cx-receipt-paper__fiscal">{doc.fiscal}</span> : null}
    </div>
  );
}
