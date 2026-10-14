/** Vane's answer as it wrote it: paragraphs, lists straight after a sentence, and tables with their numbers set right. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VaneText } from "./vane-text";

describe("Vane's text", () => {
  it("draws a table from pipe rows, numbers to the right", () => {
    const html = renderToStaticMarkup(
      <VaneText text={"11 deals went cold in Negotiating since July.\n| Owner | Went cold |\n| --- | --- |\n| Kuda | 7 |\n| Tinashe | 3 |"} />,
    );
    expect(html).toContain("<p");
    expect(html).toContain('<th scope="col">Owner</th>');
    expect(html).toContain('<th scope="col" class="num">Went cold</th>');
    expect(html).toContain('<td class="num">7</td>');
    expect(html).not.toContain("---");
  });

  it("keeps a list after a sentence, and links inside the app", () => {
    const html = renderToStaticMarkup(<VaneText text={"Two are late:\n- PO-0412\n- PO-0415\n[See them](/retail/buying/orders?late=late)"} />);
    expect(html).toContain("<li>PO-0412</li>");
    expect(html).toContain('href="/retail/buying/orders?late=late"');
  });
});
