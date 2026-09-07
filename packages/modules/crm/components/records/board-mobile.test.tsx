import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MobileBoard } from "./board-mobile";

/**
 * The board's phone view: a stage picker and one list.
 *
 * The stage it lands on is resolved on every render rather than stored, so a
 * stage that disappears when the filters change cannot leave the list stuck on
 * an id that no longer exists. These assert on what comes out, not on what the
 * component intends.
 */
const STAGES = [
  { id: "NEW", label: "New", count: 0, rows: [] },
  {
    id: "QUOTED",
    label: "Quoted",
    count: 2,
    meta: "USD 18,000",
    rows: [
      { id: "a", href: "/crm/deals/a", title: "Shopfront", subtitle: "DL-1 · Meikles" },
      { id: "b", href: "/crm/deals/b", title: "Balustrade", subtitle: "DL-2 · Rainbow" },
    ],
  },
  { id: "WON", label: "Won", count: 1, rows: [{ id: "c", href: "/c", title: "Curtain wall" }] },
];

describe("MobileBoard", () => {
  it("opens on the first stage that has anything in it", () => {
    const html = renderToStaticMarkup(<MobileBoard stages={STAGES} />);

    expect(html).toContain("Shopfront");
    expect(html).toContain("Balustrade");
    // Only the picked stage's rows are in the document — this is one list, not
    // a stack of every column.
    expect(html).not.toContain("Curtain wall");
  });

  it("shows every stage as a chip with its count", () => {
    const html = renderToStaticMarkup(<MobileBoard stages={STAGES} />);
    for (const label of ["New", "Quoted", "Won"]) expect(html).toContain(label);
    // The empty stage is still offered — it is where you look to confirm it is
    // empty, and a picker that hides stages is a picker you cannot trust.
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("says what the picked stage holds, in words, before the total", () => {
    const html = renderToStaticMarkup(
      <MobileBoard stages={STAGES} noun={{ one: "deal", many: "deals" }} />,
    );
    // The line used to be the bare total the caller passed, with nothing
    // saying whether it was the stage's, the board's or the page's.
    expect(html).toContain("deals in");
    expect(html).toContain("Quoted");
    expect(html).toContain("USD 18,000");
  });

  it("counts one of something in the singular", () => {
    const html = renderToStaticMarkup(
      <MobileBoard
        stages={[
          {
            id: "NEW",
            label: "Discovery",
            count: 1,
            rows: [{ id: "a", href: "/a", title: "Tenant billing portal" }],
          },
        ]}
        noun={{ one: "deal", many: "deals" }}
      />,
    );
    // The count sits in its own tabular-numerals span, so the assertion is on
    // the words that follow it.
    expect(html).toContain("deal in Discovery");
    expect(html).not.toContain("deals in");
  });

  it("still names the stage when the caller passes no total", () => {
    const html = renderToStaticMarkup(
      <MobileBoard
        stages={[{ id: "NEW", label: "New", count: 3, rows: [] }]}
        noun={{ one: "lead", many: "leads" }}
      />,
    );
    expect(html).toContain("leads in");
    expect(html).toContain("New");
  });

  it("falls back to the first stage when every one is empty", () => {
    const html = renderToStaticMarkup(
      <MobileBoard
        stages={[{ id: "NEW", label: "New", count: 0, rows: [] }]}
        emptyTitle="No leads in this stage"
      />,
    );
    expect(html).toContain("No leads in this stage");
  });

  it("says so when there are no stages at all", () => {
    // Not an empty document: a phone showing nothing under the toolbar reads
    // as a page that failed, not a board with nothing in it.
    const html = renderToStaticMarkup(
      <MobileBoard stages={[]} emptyTitle="No leads yet" />,
    );
    expect(html).toContain("No leads yet");
  });
});
