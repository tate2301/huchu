import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MobileRow, MobileRows } from "./mobile-rows";

/**
 * The non-navigating row, used wherever a report table becomes a list.
 *
 * Same grammar as `RecordList`: one row per item, at most two lines in it, the
 * one figure that matters on the right, rows separated by whitespace rather
 * than ruled off.
 */
describe("MobileRows", () => {
  it("renders a list, not a stack of cards", () => {
    const html = renderToStaticMarkup(
      <MobileRows>
        <MobileRow title="Tendai" subtitle="8 won · 3 lost" value="USD 42,000" />
      </MobileRows>,
    );

    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("Tendai");
    expect(html).toContain("8 won · 3 lost");
    expect(html).toContain("USD 42,000");
    // No frame around a row — that is what makes it a list rather than cards.
    expect(html).not.toContain("border");
  });

  it("drops the value and subtitle when there are none", () => {
    const html = renderToStaticMarkup(
      <MobileRows>
        <MobileRow title="Unassigned" />
      </MobileRows>,
    );
    expect(html).toContain("Unassigned");
    // One line, so no second span and no right-hand figure.
    expect(html).not.toContain("tabular-nums");
  });

  it("puts the value in a monospaced column so figures line up", () => {
    const html = renderToStaticMarkup(
      <MobileRows>
        <MobileRow title="A" value="1,000" />
        <MobileRow title="B" value="12" />
      </MobileRows>,
    );
    expect(html.match(/font-mono/g)).toHaveLength(2);
  });
});
