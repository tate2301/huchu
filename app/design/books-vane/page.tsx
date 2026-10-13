"use client";

import { MoneyPageView } from "@/components/books/money-view";
import { ButtonLink, KitScreen } from "@/components/core";
import { VanePanelView } from "@/components/vane/vane-panel-view";

import { booksPanel } from "../_fixtures/books";
import { FIXTURE_MONEY } from "../_fixtures/books-data";
import { FIXTURE_BOOKS_VANE } from "../_fixtures/vane";
import { FixtureShell } from "../_fixtures/shell";

/** Books → Money with Vane open (design/core-modules/html/books-vane.html). */
export default function BooksVaneFixture() {
  return (
    <KitScreen slug="books-vane">
      <FixtureShell
        module="Books"
        panelTitle="Books"
        {...booksPanel("Money")}
        title="Money"
        titleIcon="overview"
        vaneOpen
        actions={
          <ButtonLink href="#new" variant="primary" icon="plus" shortcut="N">
            New invoice
          </ButtonLink>
        }
      >
        <MoneyPageView
          data={FIXTURE_MONEY}
          vaneOpen
          vane={<VanePanelView panel={FIXTURE_BOOKS_VANE} canPause onPause={() => {}} onClose={() => {}} onAct={() => {}} onNotNow={() => {}} onGiveJob={() => {}} />}
        />
      </FixtureShell>
    </KitScreen>
  );
}
