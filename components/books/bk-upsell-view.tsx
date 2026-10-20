"use client";

import { ButtonLink, Icon, type IconName } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import type { UpsellView } from "@/lib/books/upsell";

import { BooksPage, Figures } from "./figures";

/** What the Books screens add (books_pages_b.py `upsell()`): one line each. */
const ADDS: Array<{ icon: IconName; what: string; detail: string }> = [
  { icon: "invoice", what: "Invoices and bills in one place", detail: "With their payments, from every module" },
  { icon: "match", what: "Bank matching", detail: "Vane proposes, you accept" },
  { icon: "vat", what: "VAT returns", detail: "The VAT 7 schedule, ready to file" },
  { icon: "done", what: "The month’s close", detail: "A checklist, then the month locks" },
  { icon: "books", what: "The ledger for your accountant", detail: "Trial balance, statements, audit trail" },
];

/** Management → Apps → Billing, where the owner adds Books. */
export const ADD_BOOKS_HREF = "/preferences/organization/billing";
/** Management → Company → Accountant export: free, so the figures are never held back. */
export const ACCOUNTANT_EXPORT_HREF = "/management/accountant-export";

/**
 * A Books address in a workspace without the screens (BkUpsell, books-final
 * §1.2): the books' own figures from the core, what the screens add, Add Books
 * for the owner (everyone else asks the owner), and the accountant export.
 */
export function BkUpsellView({ view }: { view: UpsellView }) {
  return (
    <>
      <PageChrome title="Books" />
      <BooksPage screen="bk-b">
        <div className="bk-body">
          <div className="bk-col" style={{ alignItems: "center", padding: "0 16px" }}>
            <div style={{ width: 640, maxWidth: "100%", padding: "72px 0 48px" }}>
              <p className="lede-figure">
                <Figures text={view.finding.fact} />{" "}
                <span className="q">{view.finding.rest}</span>
              </p>
              <h2 className="bk-h3" style={{ marginTop: 40, fontSize: 16 }}>
                What the Books screens add
              </h2>
              <ul className="bk-upsell" style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
                {ADDS.map((add) => (
                  <li key={add.what}>
                    <Icon name={add.icon} />
                    <span>
                      <b>{add.what}</b>
                      <em>{add.detail}</em>
                    </span>
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 40 }}>
                {view.canAdd ? (
                  <>
                    <ButtonLink href={ADD_BOOKS_HREF} variant="primary" size="lg" icon="plus" shortcut="A">
                      Add Books
                    </ButtonLink>
                    <span className="pill pill-n">Price to be set</span>
                  </>
                ) : (
                  <span className="bk-note">Ask your owner to add Books.</span>
                )}
                <span style={{ flex: 1 }} />
                <ButtonLink href={ACCOUNTANT_EXPORT_HREF} variant="quiet" size="lg" icon="export">
                  Accountant export
                </ButtonLink>
              </div>
              <p className="bk-note" style={{ marginTop: 16 }}>
                Adding Books loses nothing: every document is already there.
              </p>
            </div>
          </div>
        </div>
      </BooksPage>
    </>
  );
}
