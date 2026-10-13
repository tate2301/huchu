"use client";

import { BankPageView } from "@/components/books/bank-view";
import { Button, KitScreen } from "@/components/core";

import { booksPanel } from "../_fixtures/books";
import { FIXTURE_BANK } from "../_fixtures/books-data";
import { FixtureShell } from "../_fixtures/shell";

/** Books → Bank with Vane's three matches (design/core-modules/html/books-bank.html). */
export default function BooksBankFixture() {
  return (
    <KitScreen slug="books-bank">
      <FixtureShell
        module="Books"
        panelTitle="Books"
        {...booksPanel("Bank")}
        title="Bank"
        titleIcon="bank"
        actions={
          <Button variant="primary" icon="upload2" shortcut="U">
            Upload a statement
          </Button>
        }
      >
        <BankPageView
          data={FIXTURE_BANK}
          onAccount={() => {}}
          onTab={() => {}}
          onAccept={() => {}}
          onAcceptAll={() => {}}
          onChoose={() => {}}
          onSuggestion={() => {}}
          onUpload={() => {}}
        />
      </FixtureShell>
    </KitScreen>
  );
}
