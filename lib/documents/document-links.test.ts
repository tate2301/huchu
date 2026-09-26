/**
 * The links block at the foot of a quotation or invoice PDF.
 *
 * The PDF is also the copy that gets printed, signed and filed, and a link on
 * paper is only its text. So the thing to pin is not that an anchor exists but
 * that each address is printed in full, and that a document with nothing to
 * review prints no empty heading. Driven through the real catalogue templates,
 * as `banking-block.test.ts` is.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";
import { renderDocumentHtml } from "@/lib/documents/html-renderer";
import type { CompanyBrandingSnapshot, UniversalDocumentPayload } from "@/lib/documents/types";

function catalogTemplate(key: string) {
  const entry = DEFAULT_TEMPLATE_CATALOG.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`No default template for ${key}`);
  return entry.schema;
}

const QUOTATION = catalogTemplate("accounting.sales.quotation");

const branding: CompanyBrandingSnapshot = { displayName: "Floorcode Zimbabwe" };

const base: UniversalDocumentPayload = {
  title: "Quotation",
  notes: ["Installation within ten working days of acceptance."],
  record: { sections: [] },
};

function render(payload: UniversalDocumentPayload) {
  return renderDocumentHtml({ payload, branding, template: QUOTATION });
}

describe("the links block", () => {
  const links = {
    heading: "Review before you accept",
    items: [
      {
        title: "Floorcode brochure",
        description: "Finishes, colours and where they have been laid",
        url: "https://example.invalid/brochure.pdf",
      },
      { title: "Resin data sheet", url: "https://example.invalid/resin?lang=en&v=2" },
    ],
  };

  it("prints each resource with its address written out", () => {
    const html = render({ ...base, links });
    expect(html).toContain("Review before you accept");
    expect(html).toContain("Floorcode brochure");
    expect(html).toContain("Finishes, colours and where they have been laid");
    expect(html).toContain('href="https://example.invalid/brochure.pdf"');
    // The address as text, not only as an href: paper cannot be clicked.
    expect(html).toContain('<div class="link-url mono">https://example.invalid/brochure.pdf</div>');
    expect(html).toContain("https://example.invalid/resin?lang=en&amp;v=2");
  });

  it("comes after the notes", () => {
    const html = render({ ...base, links });
    expect(html.indexOf("Review before you accept")).toBeGreaterThan(
      html.indexOf("Installation within ten working days"),
    );
  });

  it("prints no heading when there is nothing to review", () => {
    expect(render(base)).not.toContain('class="links-block"');
    expect(render({ ...base, links: { heading: "Review before you accept", items: [] } })).not.toContain(
      'class="links-block"',
    );
  });

  it("escapes what a tenant typed", () => {
    const html = render({
      ...base,
      links: {
        heading: "Review before you accept",
        items: [{ title: "<script>x</script>", url: 'https://example.invalid/"onmouseover' }],
      },
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain('"onmouseover');
  });
});
