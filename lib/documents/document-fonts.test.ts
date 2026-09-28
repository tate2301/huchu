import { describe, expect, it } from "vitest";

import {
  BRANDING_FONT_OPTIONS,
  DOCUMENT_MONO_FONT_FAMILY,
  getDocumentFontByKey,
} from "@/lib/platform/branding";
import { renderDocumentHtml } from "@/lib/documents/html-renderer";
import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";
import type { CompanyBrandingSnapshot, UniversalDocumentPayload } from "@/lib/documents/types";

/**
 * The tenant's font has to survive the trip onto paper.
 *
 * A document is rendered from a standalone HTML string in a headless browser,
 * with none of the app's stylesheets in scope. Every branding option's app
 * value is built on a CSS custom property — `var(--font-sans)`, or
 * `var(--font-brand-inter)`, which is defined nowhere in the repository at
 * all — and an unresolved `var()` invalidates the whole `font-family`
 * declaration, taking its fallback stack down with it. So every tenant's
 * document printed in the browser's default face whatever they had chosen,
 * and nothing failed loudly enough to notice.
 */
const QUOTATION = DEFAULT_TEMPLATE_CATALOG.find(
  (entry) => entry.key === "accounting.sales.quotation",
)!.schema;

const payload: UniversalDocumentPayload = { title: "Quotation", record: { sections: [] } };

function render(branding: CompanyBrandingSnapshot) {
  return renderDocumentHtml({ payload, branding, template: QUOTATION });
}

describe("every branding font resolves for a document", () => {
  for (const option of BRANDING_FONT_OPTIONS) {
    it(`names real families for "${option.key}" — never a var()`, () => {
      const font = getDocumentFontByKey(option.key);
      expect(font.fontFamily).not.toMatch(/var\(/);
      expect(font.fontFamily.trim()).not.toBe("");
      // Something has to actually be fetched, or the container has no such face.
      expect(font.importUrl).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
    });
  }

  it("falls back to the default option for a key that is not one", () => {
    const unknown = getDocumentFontByKey("not-a-font" as never);
    expect(unknown.fontFamily).toBe(BRANDING_FONT_OPTIONS[0].documentFontFamily);
  });
});

describe("the rendered document", () => {
  const branding = (key: (typeof BRANDING_FONT_OPTIONS)[number]["key"]): CompanyBrandingSnapshot => {
    const font = getDocumentFontByKey(key);
    return {
      displayName: "Hurudza Creative",
      fontFamily: font.fontFamily,
      fontImportUrl: font.importUrl,
      monoFontFamily: DOCUMENT_MONO_FONT_FAMILY,
    };
  };

  it("carries no app-scoped font variable into the document", () => {
    for (const option of BRANDING_FONT_OPTIONS) {
      const html = render(branding(option.key));
      // The document defines its own `--accent` and the like in :root, which
      // are fine. What must never appear is a variable only the app declares.
      expect(html).not.toMatch(/var\(--font-/);
    }
  });

  it("asks the browser to fetch the chosen face", () => {
    const html = render(branding("poppins"));
    expect(html).toContain("@import url(");
    expect(html).toContain("fonts.googleapis.com");
    expect(html).toContain("Poppins");
  });

  it("sets figures in the same monospace face the app uses", () => {
    const html = render(branding("huchu"));
    expect(html).toContain("Atkinson Hyperlegible Mono");
    // The old hard-coded face was never loaded, so it only ever resolved to
    // whatever monospace the container happened to have.
    expect(html).not.toContain("JetBrains Mono");
  });

  it("still renders when a tenant has no font configured", () => {
    const html = render({ displayName: "Hurudza Creative" });
    expect(html).toMatch(/font-family: "Inter"/);
    expect(html).not.toContain("@import url(");
  });
});
