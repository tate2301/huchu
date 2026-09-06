import { describe, expect, it } from "vitest";

import {
  buildDefaultChecklist,
  composeItemDescription,
  DEFAULT_SITE_VISIT_CHECKLIST,
  formatDimensions,
  siteVisitReportSchema,
  visitItemsToQuotationLines,
} from "./site-visits";

describe("formatDimensions", () => {
  it("formats width × height", () => {
    expect(formatDimensions({ widthMm: 1200, heightMm: 1500 })).toBe("1200 × 1500 mm");
  });

  it("includes depth when present", () => {
    expect(formatDimensions({ widthMm: 1200, heightMm: 1500, depthMm: 300 })).toBe(
      "1200 × 1500 × 300 mm",
    );
  });

  it("returns null when fewer than two dimensions are known", () => {
    expect(formatDimensions({ widthMm: 1200 })).toBeNull();
    expect(formatDimensions({})).toBeNull();
    expect(formatDimensions({ widthMm: 0, heightMm: 0 })).toBeNull();
  });
});

describe("composeItemDescription", () => {
  it("combines category, description, dimensions and spec notes", () => {
    expect(
      composeItemDescription({
        category: "Windows",
        description: "Aluminium sliding window",
        widthMm: 1200,
        heightMm: 1500,
        specNotes: "powder-coated, 6mm glass",
      }),
    ).toBe("Windows: Aluminium sliding window (1200 × 1500 mm) — powder-coated, 6mm glass");
  });

  it("omits absent parts without leaving separators behind", () => {
    expect(composeItemDescription({ description: "Site clearance" })).toBe("Site clearance");
  });

  it("truncates to the 300-character quotation line limit", () => {
    const result = composeItemDescription({ description: "x".repeat(400) });
    expect(result).toHaveLength(300);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("visitItemsToQuotationLines", () => {
  it("maps measured items into quotation lines", () => {
    const lines = visitItemsToQuotationLines([
      {
        category: "Windows",
        description: "Sliding window",
        quantity: 4,
        widthMm: 1200,
        heightMm: 1500,
        unitPrice: 250,
      },
      { description: "Installation labour", quantity: 1, unitPrice: 400 },
    ]);

    expect(lines).toEqual([
      { description: "Windows: Sliding window (1200 × 1500 mm)", quantity: 4, unitPrice: 250 },
      { description: "Installation labour", quantity: 1, unitPrice: 400 },
    ]);
  });

  it("defaults unpriced items to zero so pricing happens in the builder", () => {
    const [line] = visitItemsToQuotationLines([{ description: "Door frame", quantity: 2 }]);
    expect(line.unitPrice).toBe(0);
  });

  it("drops rows with no description or no quantity", () => {
    const lines = visitItemsToQuotationLines([
      { description: "   ", quantity: 3 },
      { description: "Valid", quantity: 0 },
      { description: "Kept", quantity: 1 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Kept");
  });
});

describe("buildDefaultChecklist", () => {
  it("seeds every default item unchecked", () => {
    const checklist = buildDefaultChecklist();
    expect(checklist).toHaveLength(DEFAULT_SITE_VISIT_CHECKLIST.length);
    expect(checklist.every((item) => item.checked === false)).toBe(true);
  });
});

describe("siteVisitReportSchema", () => {
  it("accepts a complete report", () => {
    const parsed = siteVisitReportSchema.parse({
      checklist: [{ key: "access_confirmed", label: "Access", checked: true }],
      photos: [{ url: "https://example.com/a.jpg", kind: "PHOTO" }],
      siteConditions: "Steep driveway, no power on site",
      items: [{ description: "Window", quantity: 2, widthMm: 1000, heightMm: 1200 }],
      markCompleted: true,
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.markCompleted).toBe(true);
  });

  it("rejects a zero-quantity measurement", () => {
    expect(() =>
      siteVisitReportSchema.parse({ items: [{ description: "Window", quantity: 0 }] }),
    ).toThrow();
  });

  it("rejects a photo that is not a URL", () => {
    expect(() =>
      siteVisitReportSchema.parse({ photos: [{ url: "not-a-url", kind: "PHOTO" }] }),
    ).toThrow();
  });
});
