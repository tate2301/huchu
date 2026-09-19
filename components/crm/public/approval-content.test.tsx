import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ApprovalDocument, type ApprovalDoc } from "./approval-content";

/**
 * What a customer sees when they open the link we sent them.
 *
 * The bug this covers: a rep re-reading a quote's approval link used to mint a
 * new token, and the copy already in the customer's inbox started answering
 * "Document not found" — a business that appears to have lost the quote. The
 * token no longer rotates on a read, and when a link genuinely is withdrawn or
 * expired, the page has to say which, without disclosing the pricing.
 */
const base: ApprovalDoc = {
  companyName: "Floorcode Zimbabwe",
  documentType: "INVOICE",
  status: "PENDING",
  number: "INV-2026-0142",
  currency: "USD",
  total: 9717.5,
  subTotal: 8450,
  taxTotal: 1267.5,
  issuedAt: "2026-09-19T00:00:00.000Z",
  validUntil: null,
  dueDate: "2026-10-03T00:00:00.000Z",
  notes: "Installation scheduled for the week of 5 October.",
  billedTo: "Kariba Lodges (Private) Limited",
  lines: [
    {
      description: "Engineered oak flooring\n190mm plank, matt lacquer",
      quantity: 62,
      unitPrice: 95,
      taxRate: 15,
      lineTotal: 5890,
    },
  ],
  branding: {
    logoUrl: null,
    primaryColor: "#0f766e",
    email: "sales@example.invalid",
    phone: "+263 77 000 0000",
    website: null,
    physicalAddress: "6667 Doma Road, Zimre Park",
    registrationNumber: null,
    vatNumber: null,
    paymentRows: [{ label: "Bank", value: "Test Bank" }],
    paymentTerms: null,
    footerText: null,
  },
  linkState: "ACTIVE",
};

function render(doc: Partial<ApprovalDoc> = {}) {
  return renderToStaticMarkup(<ApprovalDocument doc={{ ...base, ...doc }} />);
}

describe("an active link", () => {
  it("shows the document, priced", () => {
    const html = render();
    expect(html).toContain("INV-2026-0142");
    expect(html).toContain("Kariba Lodges (Private) Limited");
    expect(html).toContain("USD 9,717.50");
    expect(html).toContain("Total due");
  });

  it("sets a line's first line as the item and the rest as its description", () => {
    const html = render();
    expect(html).toContain("Engineered oak flooring");
    expect(html).toContain("190mm plank, matt lacquer");
    // Split onto two lines, not printed as one run of text with a newline in it.
    expect(html).not.toContain("Engineered oak flooring\n190mm");
  });

  it("carries the sender's own branding rather than ours", () => {
    const html = render();
    // The brand colour drives the rule and the initials tile.
    expect(html).toContain("#0f766e");
    expect(html).toContain("Floorcode Zimbabwe");
    // No logo uploaded, so the mark is the initials rather than a gap.
    expect(html).toContain("FZ");
  });
});

describe("a link that no longer works", () => {
  it("says a withdrawn link was replaced, and withholds the pricing", () => {
    const html = render({ linkState: "REVOKED", total: 0, subTotal: 0, taxTotal: 0, lines: [] });
    expect(html).toContain("replaced");
    expect(html).not.toContain("not found");
    expect(html).not.toContain("Engineered oak flooring");
  });

  it("says an expired link expired, and withholds the pricing", () => {
    const html = render({
      linkState: "EXPIRED",
      total: 0,
      subTotal: 0,
      taxTotal: 0,
      lines: [],
    });
    expect(html).toContain("expired");
    expect(html).not.toContain("replaced");
    expect(html).not.toContain("Engineered oak flooring");
  });

  it("still names the sender, so the customer knows who to ask", () => {
    const html = render({ linkState: "REVOKED", lines: [] });
    expect(html).toContain("Floorcode Zimbabwe");
    expect(html).toContain("+263 77 000 0000");
  });
});
