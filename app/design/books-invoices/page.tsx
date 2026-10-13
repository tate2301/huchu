"use client";

import { InvoicesPageView } from "@/components/books/invoices-view";
import { ButtonLink, KitScreen } from "@/components/core";

import { booksPanel } from "../_fixtures/books";
import { FIXTURE_INVOICES } from "../_fixtures/books-data";
import { FixtureShell } from "../_fixtures/shell";

/** Books → Invoices with the three overdue selected (design/core-modules/html/books-invoices.html). */
export default function BooksInvoicesFixture() {
  return (
    <KitScreen slug="books-invoices">
      <FixtureShell
        module="Books"
        panelTitle="Books"
        {...booksPanel("Invoices")}
        title="Invoices"
        titleIcon="invoice"
        actions={
          <ButtonLink href="#new" variant="primary" icon="plus" shortcut="N">
            New invoice
          </ButtonLink>
        }
      >
        <InvoicesPageView
          data={FIXTURE_INVOICES}
          onQuery={() => {}}
          onSendReminders={() => {}}
          onPrintStatements={() => {}}
          exportHref="#export"
          initialSelection={["INV-0131", "INV-0135", "INV-0137"]}
        />
      </FixtureShell>
    </KitScreen>
  );
}
