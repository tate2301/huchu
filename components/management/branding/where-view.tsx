import * as React from "react";
import Link from "next/link";

import { ButtonLink, Icon } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import type { QuotePreview as Preview } from "@/lib/branding/form";

import styles from "./branding.module.css";
import { BrandMark } from "./quote-preview";

type Card = {
  key: string;
  title: string;
  /** The figures are the sample every template preview uses; the brand is the workspace's. */
  lines: Array<[string, string]>;
  total: [string, string];
  foot: string;
  caption: string;
  kind: string;
  href: string;
};

/**
 * Where it shows (PageBrandWhere): every template that prints the brand, each
 * drawn with this workspace's mark, colour, bank details and footer. Each card
 * opens its templates in Build, where the rest of the paper is decided.
 */
export function BrandWhereView({ preview, email }: { preview: Preview; email: string | null }) {
  const pay = preview.payment.slice(0, 2).map((row) => row.value).join(" ");
  const vat = preview.legal.split(" · ").find((part) => part.startsWith("VAT"));
  const cards: Card[] = [
    {
      key: "quote",
      title: "Quotation",
      lines: [
        ["Custom logo mat 85×150cm", "414.00"],
        ["Entrance mat 60×90cm", "299.00"],
        ["Measurement and fitting", "50.00"],
      ],
      total: ["Total", "USD 763.00"],
      foot: [pay ? `Pay to ${pay}` : null, preview.paymentTerms].filter(Boolean).join(" · "),
      caption: "Quotation",
      kind: "Document template, used by CRM",
      href: "/build/templates?kind=documents",
    },
    {
      key: "invoice",
      title: "Tax invoice",
      lines: [
        ["INV-20260724-1015-482, Acme Retail", ""],
        ["Custom logo mat, 2", "414.00"],
        ["VAT 15%", "93.00"],
      ],
      total: ["Total", "USD 763.00"],
      foot: [vat, preview.footer].filter(Boolean).join(" · "),
      caption: "Tax invoice, fiscalised",
      kind: "Document template, used by Books",
      href: "/build/templates?kind=documents",
    },
    {
      key: "payslip",
      title: "Payslip",
      lines: [
        ["Basic pay", "780.00"],
        ["NSSA", "−31.50"],
        ["PAYE and AIDS levy", "−156.69"],
      ],
      total: ["Net pay", "USD 591.81"],
      foot: [preview.signatureUrl ? "Signed with the signature on file" : null, pay ? `Paid to ${pay}` : null].filter(Boolean).join(" · "),
      caption: "Payslip",
      kind: "Document template, used by Payroll",
      href: "/build/templates?kind=documents",
    },
    {
      key: "email",
      title: "Email",
      lines: [
        ["Subject", "INV-20260724-1015-482"],
        ["Amount due", "463.00"],
        ["Attached", "PDF"],
      ],
      total: ["Pay with", "Pay now"],
      foot: [email ? `From ${email}` : null, preview.footer].filter(Boolean).join(" · "),
      caption: "Invoice email",
      kind: "Email template, used by Books",
      href: "/build/templates?kind=emails",
    },
  ];

  return (
    <KitPage
      title="Branding"
      mark={<Icon name="brand" />}
      flush
      actions={
        <ButtonLink icon="back" href="/preferences/organization/branding/identity">
          Back to Branding
        </ButtonLink>
      }
    >
      <div className={`xp ${styles.where}`}>
          <div className="xp-k">
            <Icon name="brand" />
            Branding
          </div>
          <h1>One brand, set once, on everything {preview.name} sends.</h1>
          <p className="lede">
            Each of these is a template in Build. Branding fills the letterhead, colours, bank details and footer; the template decides the rest.
          </p>
          <div className={styles.cards}>
            {cards.map((card) => (
              <Link key={card.key} href={card.href} className={styles.link} aria-label={`${card.caption}, open its templates in Build`}>
                <figure className={styles.figure}>
                  <div className={styles.paper} data-lint-ignore="T2 T3 W3" style={preview.fontFamily ? { fontFamily: preview.fontFamily } : undefined}>
                    <span className={styles.kv} style={{ alignItems: "center" }}>
                      <span className={styles.issuer}>
                        <BrandMark preview={preview} size={20} />
                        <b style={{ fontSize: 12 }}>{preview.name}</b>
                      </span>
                      <b style={{ color: preview.primary, flex: "none" }}>{card.title}</b>
                    </span>
                    <span className={styles.rule} style={{ background: preview.primary }} />
                    {card.lines.map(([label, value]) => (
                      <span className={styles.kv} key={label}>
                        <span>{label}</span>
                        <span>{value}</span>
                      </span>
                    ))}
                    <span className={styles.kv} style={{ fontWeight: 600 }}>
                      <span>{card.total[0]}</span>
                      <span style={{ color: preview.primary }}>{card.total[1]}</span>
                    </span>
                    <span style={{ flex: 1 }} />
                    {card.foot ? <span className={styles.paperMuted}>{card.foot}</span> : null}
                  </div>
                  <figcaption className={styles.caption}>
                    <b>{card.caption}</b>
                    <span>{card.kind}</span>
                  </figcaption>
                </figure>
              </Link>
            ))}
          </div>
      </div>
    </KitPage>
  );
}
