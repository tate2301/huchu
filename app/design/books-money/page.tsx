"use client";

import { MoneyPageView } from "@/components/books/money-view";
import { ButtonGroup, ButtonLink, KitScreen } from "@/components/core";

import { booksPanel } from "../_fixtures/books";
import { FIXTURE_MONEY } from "../_fixtures/books-data";
import { FixtureShell } from "../_fixtures/shell";

/** Books → Money with the board's figures (design/core-modules/html/books-money.html). */
export default function BooksMoneyFixture() {
  return (
    <KitScreen slug="books-money">
      <FixtureShell
        module="Books"
        panelTitle="Books"
        {...booksPanel("Money")}
        title="Money"
        titleIcon="overview"
        actions={
          <>
            <ButtonGroup aria-label="Record">
              <ButtonLink href="#receipt" icon="photo">
                Add a receipt
              </ButtonLink>
              <ButtonLink href="#payment" icon="payments">
                Record a payment
              </ButtonLink>
            </ButtonGroup>
            <ButtonLink href="#new" variant="primary" icon="plus" shortcut="N">
              New invoice
            </ButtonLink>
          </>
        }
      >
        <MoneyPageView data={FIXTURE_MONEY} vaneOpen={false} />
      </FixtureShell>
    </KitScreen>
  );
}
