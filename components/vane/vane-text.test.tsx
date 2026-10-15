/** Vane's answer as rich text: formatting drawn, not shown; lists and tables straight after a sentence; links inside the app only. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { tidy, VaneText } from "./vane-text";

const html = (text: string) => renderToStaticMarkup(<VaneText text={text} />);

describe("Vane's text", () => {
  it("draws a table from pipe rows straight after a sentence, numbers to the right", () => {
    const out = html("11 deals went cold in Negotiating since July.\n| Owner | Went cold |\n| --- | --- |\n| Kuda | 7 |\n| Tinashe | 3 |");
    expect(out).toContain("<p>11 deals went cold");
    expect(out).toContain('<th scope="col">Owner</th>');
    expect(out).toContain('<th scope="col" class="num">Went cold</th>');
    expect(out).toContain('<td class="num">7</td>');
    expect(out).not.toContain("---");
  });

  it("keeps a list after a sentence, and a link line after the list its own paragraph", () => {
    const out = html("Two are late:\n- PO-0412\n- PO-0415\n[See them](/retail/buying/orders?late=late)");
    expect(out).toContain("<li>PO-0412</li>");
    expect(out).toContain("<li>PO-0415</li>");
    expect(out).toContain('<p><a class="link" href="/retail/buying/orders?late=late">See them</a></p>');
  });

  it("draws bold, italic, headings, numbered lists and code, not the marks", () => {
    const out = html("## What I found\n**$2,480.00** is overdue, *mostly* Pomona.\n1. Send the reminders\n2. Call Mrs Gumbo\n\nThe column is `dueDate`.");
    expect(out).toContain("<h4>What I found</h4>");
    expect(out).toContain("<strong>$2,480.00</strong>");
    expect(out).toContain("<em>mostly</em>");
    expect(out).toContain("<ol>");
    expect(out).toContain("<code>dueDate</code>");
    expect(out).not.toMatch(/\*\*|##/);
  });

  it("never links outside the app, draws no image and reads no HTML", () => {
    const out = html("[Pay here](https://example.com/pay) ![x](/x.png) <script>alert(1)</script>");
    expect(out).not.toContain("href");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("Pay here");
  });

  it("makes a bullet Vane wrote with • an item", () => {
    expect(tidy("Done:\n• one\n• two")).toBe("Done:\n\n- one\n- two");
  });
});
