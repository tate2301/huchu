"use client";

import { MoneyPageView } from "@/components/books/money-view";
import { ButtonLink, KitScreen } from "@/components/core";
import { VanePanelView } from "@/components/vane/vane-panel-view";
import type { VanePanel } from "@/lib/vane/panel";

import { booksPanel } from "../_fixtures/books";
import { FIXTURE_MONEY } from "../_fixtures/books-data";
import { FixtureShell } from "../_fixtures/shell";

/** Vane's panel over Books → Money, as books-vane.html draws it. */
const PANEL: VanePanel = {
  status: { open: 5, working: true, now: { label: "Reading the CBZ statement Rudo uploaded", progress: "38 of 61 lines" }, paused: false, lastWorkedAt: null, unreachable: false },
  state: null,
  items: [
    {
      id: "v1",
      kind: "suggestion",
      source: "Books",
      headline: "3 invoices are overdue, $2,480.00.",
      body: "Chisipite Dental first: 12 days late, which is later than they usually pay. Let's send the 3 reminders I drafted.",
      action: { type: "send", label: "Send 3 reminders", shortcut: "S", target: "/books/invoices?view=overdue", also: { label: "Read them first", target: "/books/invoices?view=overdue" } },
      createdAt: "2026-10-06T06:02:00",
    },
    {
      id: "v2",
      kind: "issue",
      source: "Tender",
      headline: "Monday's cash-up was short again.",
      body: "$12.00 on Till 1, the third time since August, each time on the morning shift. Let's go through that shift's cash sales.",
      action: { type: "review", label: "Show the sales", target: "/retail/sales" },
      createdAt: "2026-10-06T06:01:00",
    },
    {
      id: "v3",
      kind: "suggestion",
      source: "CRM",
      headline: "A deal was won 4 days ago with no invoice.",
      body: "Borrowdale Brooke Clinic, vinyl in 3 consulting rooms. I wrote the invoice from the accepted quote, $6,400.00. Let's check it and send it.",
      action: { type: "open", label: "Open the invoice", target: "/books/invoices" },
      createdAt: "2026-10-06T06:00:00",
    },
  ],
  plans: [
    {
      id: "p1",
      title: "VAT for September",
      dueOn: "2026-10-25",
      done: 1,
      steps: [
        { id: "s1", label: "Match the CBZ lines since Friday", owner: "vane", status: "done", progress: "3 of 4" },
        { id: "s2", label: "Find VAT numbers on 2 receipts", owner: "vane", status: "now", progress: null },
        { id: "s3", label: "Check the return Vane drafted", owner: "person", status: "todo", progress: null },
        { id: "s4", label: "File the return on ZIMRA's portal", owner: "person", status: "todo", progress: null },
      ],
    },
  ],
  done: [
    { id: "d1", text: "Matched 3 bank lines", at: "2026-10-06T06:05:00" },
    { id: "d2", text: "Drafted 3 reminders", at: "2026-10-06T06:02:00" },
    { id: "d3", text: "Wrote this week's insights", at: "2026-10-06T06:00:00" },
  ],
};

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
          vane={<VanePanelView panel={PANEL} canPause onPause={() => {}} onClose={() => {}} onAct={() => {}} onNotNow={() => {}} onGiveJob={() => {}} />}
        />
      </FixtureShell>
    </KitScreen>
  );
}
