import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RecordList } from "./record-list";

/**
 * What these pin down:
 *
 * A phone gets one row per record, two lines inside it, and — when the caller
 * has named one — the single number the row is about on the right. Facts used
 * to be dropped entirely below `sm`, which showed a deal with no value at all;
 * then the *first* fact was kept whatever it was, which put a bare "0" at the
 * end of a person's name because their first fact happened to be a deal count
 * with its label stripped. Naming the fact is the fix: a value that survives
 * without its label has to be one that means something without it.
 *
 * These assert on the emitted markup rather than on the source, because the
 * previous round's untypeable `<input type="button">` typechecked, rendered,
 * and passed every test that only ever looked at the source.
 */
const ROWS = [
  {
    id: "deal-1",
    href: "/crm/deals/deal-1",
    title: "Aluminium shopfront",
    subtitle: "DL-0012 · Meikles Hotel",
    facts: [
      { label: "Value", value: "USD 12,400", mono: true, primary: true },
      { label: "Owner", value: "Tendai" },
      { label: "Stage", value: "Quoted" },
    ],
  },
];

describe("RecordList facts", () => {
  it("shows the primary fact on a phone and hides the rest", () => {
    const html = renderToStaticMarkup(<RecordList rows={ROWS} />);

    // The mobile span: visible by default, hidden from `sm` up.
    expect(html).toContain("sm:hidden");
    // It carries the primary fact's value…
    expect(html.match(/USD 12,400/g)).toHaveLength(2); // mobile span + desktop cluster
    // …and only that one: the others live solely in the `sm:flex` cluster.
    expect(html.match(/Tendai/g)).toHaveLength(1);
    expect(html.match(/Quoted/g)).toHaveLength(1);
  });

  it("takes the primary fact wherever it sits in the list", () => {
    const html = renderToStaticMarkup(
      <RecordList
        rows={[
          {
            id: "invoice-1",
            href: "/crm/invoices/invoice-1",
            title: "Meikles Hotel",
            facts: [
              { label: "Raised", value: "12 Aug" },
              { label: "Total", value: "USD 900", mono: true, primary: true },
            ],
          },
        ]}
      />,
    );
    expect(html.match(/USD 900/g)).toHaveLength(2);
    expect(html.match(/12 Aug/g)).toHaveLength(1);
  });

  it("shows no facts on a phone when none is primary", () => {
    // A directory row's facts are a deal count and an owner. Stripped of their
    // labels — which is all a phone has room for — they are a bare "0" and a
    // name floating at the end of the row, neither of which says what it is.
    const html = renderToStaticMarkup(
      <RecordList
        rows={[
          {
            id: "person-1",
            href: "/crm/people/person-1",
            title: "Tendai Moyo",
            facts: [
              { label: "Deals", value: 0, mono: true },
              { label: "Owner", value: "Ada" },
            ],
          },
        ]}
      />,
    );
    expect(html).not.toContain("sm:hidden");
    expect(html).toContain("Tendai Moyo");
    // The desktop cluster still carries them, labelled.
    expect(html).toContain("sm:flex");
    expect(html).toContain("Deals");
  });

  it("does not repeat the primary fact's label on a phone", () => {
    const html = renderToStaticMarkup(<RecordList rows={ROWS} />);
    // "Value" is a desktop column heading; the phone row has no room to
    // explain a number that is already the only one there.
    expect(html.match(/>Value</g)).toHaveLength(1);
  });

  it("keeps a row to two lines — title and subtitle, nothing else", () => {
    const html = renderToStaticMarkup(<RecordList rows={ROWS} />);
    expect(html).toContain("Aluminium shopfront");
    expect(html).toContain("DL-0012 · Meikles Hotel");
    // No card frame: rows are separated by whitespace, not borders.
    expect(html).not.toContain("card-radius");
  });

  it("renders nothing extra when a row has no facts", () => {
    const html = renderToStaticMarkup(
      <RecordList rows={[{ id: "a", href: "/a", title: "Plain" }]} />,
    );
    expect(html).not.toContain("sm:hidden");
  });
});
