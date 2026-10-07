/**
 * A fact that can be changed in place draws as its value until pressed: a
 * button named for what it changes, holding the value, with no field on the
 * page until somebody asks for one. A fact without `edit` is unchanged.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FactList } from "./fact-list";

describe("an editable fact", () => {
  it("is a button named for the fact, showing the value, with no field yet", () => {
    const html = renderToStaticMarkup(
      <FactList
        items={[
          { label: "Price", value: "$1.20", mono: true, edit: { value: "1.2", kind: "decimal", onSave: async () => {} } },
          { label: "Site", value: "Borrowdale" },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Change Price"');
    expect(html).toMatch(/<button[^>]*>\$1\.20<\/button>/);
    expect(html).not.toContain("<input");
    // The plain fact is still plain.
    expect(html).toMatch(/<dd[^>]*>Borrowdale<\/dd>/);
  });
});
