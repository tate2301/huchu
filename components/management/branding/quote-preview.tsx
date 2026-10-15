/* eslint-disable @next/next/no-img-element -- a brand image is whatever address the workspace gave; next/image would need every host in the config. */
import * as React from "react";

import type { QuotePreview as Preview } from "@/lib/branding/form";

import styles from "./branding.module.css";

/**
 * The sample quotation every template preview uses (`lib/documents/sample-payloads.ts`),
 * cut to the lines the board shows. The brand is the workspace's; the quote is a sample.
 */
const SAMPLE = {
  number: "QTN-20260724-0930-217",
  for: "Acme Retail (Pvt) Ltd, 12 Samora Machel Ave",
  date: "24 Jul 2026, valid 31 days",
  lines: [
    { item: "Custom logo mat 85×150cm", qty: "2", amount: "414.00" },
    { item: "Entrance mat 60×90cm", qty: "4", amount: "299.00" },
    { item: "Measurement and fitting", qty: "1", amount: "50.00" },
  ],
  total: "USD 763.00",
};

/** The brand's mark: its logo, or the lettered tile the paper prints without one. */
export function BrandMark({ preview, size = 26 }: { preview: Preview; size?: number }) {
  if (preview.logoUrl) return <img className={styles.logo} src={preview.logoUrl} alt="" />;
  return (
    <span className={styles.mark} style={{ width: size, height: size, background: preview.primary, color: preview.inkOnPrimary }}>
      {preview.initials}
    </span>
  );
}

/** "Preview, a quotation · Updates as you type": the draft on paper, as the renderer prints it. */
export function QuotePreview({ preview, show }: { preview: Preview; show: "identity" | "assets" | "finance" }) {
  return (
    <aside className={`kaside ${styles.aside}`} aria-label="Preview, a quotation">
      <span className={styles.asideHead}>
        <span>Preview, a quotation</span>
        <span>Updates as you type</span>
      </span>
      <div className={styles.paper} style={preview.fontFamily ? { fontFamily: preview.fontFamily } : undefined}>
        <div className={styles.paperHead}>
          <span className={styles.issuer}>
            <BrandMark preview={preview} />
            <span>
              <b>{preview.name}</b>
              {preview.contact[0] ? <span className={styles.paperMuted}>{preview.contact[0]}</span> : null}
            </span>
          </span>
          <span className={styles.title}>
            <b style={{ color: preview.primary }}>Quotation</b>
            <br />
            <span>{SAMPLE.number}</span>
          </span>
        </div>
        <div className={styles.rule} style={{ background: preview.primary }} />
        <div className={styles.two}>
          <span>
            <span className={styles.paperMuted}>For</span>
            <br />
            {SAMPLE.for}
          </span>
          <span>
            <span className={styles.paperMuted}>Date</span>
            <br />
            {SAMPLE.date}
          </span>
        </div>
        <div>
          <div className={`${styles.line} ${styles.lineHead}`}>
            <span>Item</span>
            <span>Qty</span>
            <span>Amount</span>
          </div>
          {SAMPLE.lines.map((line) => (
            <div className={styles.line} key={line.item}>
              <span>{line.item}</span>
              <span>{line.qty}</span>
              <span>{line.amount}</span>
            </div>
          ))}
          <div className={styles.total}>
            <span>Total</span>
            <span style={{ color: preview.primary }}>{SAMPLE.total}</span>
          </div>
        </div>
        {show !== "identity" && (preview.signatureUrl || preview.stampUrl) ? (
          <div className={styles.sign}>
            {preview.signatureUrl ? <img src={preview.signatureUrl} alt="Signature" /> : <span />}
            {preview.stampUrl ? <img src={preview.stampUrl} alt="Stamp" /> : null}
          </div>
        ) : null}
        {show === "finance" && (preview.payment.length || preview.paymentTerms || preview.footer) ? (
          <div className={styles.pay}>
            {preview.payment.length ? (
              <span>
                <b>Pay to</b> {preview.payment.map((row) => row.value).join(" · ")}
              </span>
            ) : null}
            {preview.paymentTerms ? <span>{preview.paymentTerms}</span> : null}
            {preview.footer ? <span>{preview.footer}</span> : null}
          </div>
        ) : null}
        {preview.legal ? <div className={styles.legal}>{preview.legal}</div> : null}
      </div>
    </aside>
  );
}
