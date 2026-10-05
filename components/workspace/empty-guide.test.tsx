import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getReportDefinition } from "@/lib/reports/registry";
import type { EmptyGuidePublic } from "@/lib/reports/types";

import { EmptyGuide } from "./empty-guide";

/** The buying area's Suppliers guide, as the Guided board draws it. */
const SUPPLIERS: EmptyGuidePublic = {
  title: "Who do you buy from?",
  line: "Add a supplier once, and ordering becomes a tap from anything running low.",
  steps: [
    ["Add them with a name and a WhatsApp number.", "Terms and bank details can wait."],
    ["Link the products you buy from them.", "Or let it happen on their first delivery."],
    ["Order from low stock.", "Tender suggests the lines; you send them on WhatsApp."],
  ],
  primary: { label: "Add your first supplier", sheet: "supplier-new" },
  secondary: { label: "Import a spreadsheet", href: "/retail/products/import" },
};

describe("EmptyGuide", () => {
  it("teaches the Suppliers list in three numbered steps (Guided board)", () => {
    const html = renderToStaticMarkup(
      <EmptyGuide guide={SUPPLIERS} primaryHref="/retail/buying/suppliers?sheet=supplier-new" />,
    );
    expect(html).toMatch(/<h2[^>]*class="cx-eg__title"[^>]*>Who do you buy from\?<\/h2>/);
    expect(html).toContain("Add a supplier once, and ordering becomes a tap from anything running low.");
    const steps = [...html.matchAll(/<li class="cx-eg__step">(.*?)<\/li>/g)].map((match) => match[1]);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain(">1</span>");
    expect(steps[0]).toContain("<strong>Add them with a name and a WhatsApp number.</strong>");
    expect(steps[0]).toContain('<span class="cx-eg__rest">Terms and bank details can wait.</span>');
    expect(steps[1]).toContain(">2</span>");
    expect(steps[1]).toContain("<strong>Link the products you buy from them.</strong>");
    expect(steps[2]).toContain(">3</span>");
    expect(steps[2]).toContain("Tender suggests the lines; you send them on WhatsApp.");
    expect(html).toMatch(/<a class="cx-btn cx-btn--primary cx-btn--field" href="\/retail\/buying\/suppliers\?sheet=supplier-new">Add your first supplier<\/a>/);
    expect(html).toMatch(/<a class="cx-btn cx-btn--field" href="\/retail\/products\/import">Import a spreadsheet<\/a>/);
    // The board's frame label and footnote are canvas annotation.
    expect(html).not.toContain("Empty, so the guide shows");
    expect(html).not.toContain("Every empty list teaches its job");
  });

  it("draws a guide without steps as the list's icon, a statement and one line (TenderUI board)", () => {
    const shifts = getReportDefinition("retail-shifts")!.list!.empty;
    const html = renderToStaticMarkup(<EmptyGuide guide={shifts} primaryHref="/retail/shifts?sheet=shift-open" />);
    expect(html).toContain('class="cx-eg__icon"');
    expect(html).toContain("<svg");
    expect(html).toMatch(/class="cx-eg__statement"[^>]*>No shifts yet</);
    expect(html).toContain("A shift starts when a cashier opens a till with its float. Each one closes with a count.");
    expect(html).toContain('href="/retail/shifts?sheet=shift-open"');
    expect(html).toContain("Open shift");
    expect(html).not.toContain("cx-eg__steps");
  });

  it("leaves the primary out when the caller has nowhere for it to go", () => {
    const html = renderToStaticMarkup(<EmptyGuide guide={SUPPLIERS} primaryHref={null} />);
    expect(html).not.toContain("Add your first supplier");
    expect(html).toContain("Import a spreadsheet");
  });
});
