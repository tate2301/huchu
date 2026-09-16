/**
 * The trading entity and banking details on quotations and invoices.
 *
 * Both documents are rendered by the same pipeline off the same branding
 * snapshot, so these tests drive the real catalogue templates rather than a
 * hand-built schema — the thing that would break is somebody turning
 * `showPaymentDetails` off for one of them, and a hand-built schema would not
 * notice.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";
import { buildPaymentRows } from "@/lib/documents/payment-details";
import { renderDocumentHtml } from "@/lib/documents/html-renderer";
import type { CompanyBrandingSnapshot, UniversalDocumentPayload } from "@/lib/documents/types";

function catalogTemplate(key: string) {
  const entry = DEFAULT_TEMPLATE_CATALOG.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`No default template for ${key}`);
  return entry.schema;
}

const QUOTATION = catalogTemplate("accounting.sales.quotation");
const INVOICE = catalogTemplate("accounting.sales.invoice");

/** Deliberately not a real account: this file is committed. */
const branding: CompanyBrandingSnapshot = {
  displayName: "Floorcode Zimbabwe",
  legalName: "Code Oho Africa Corporation (Private) Limited",
  tradingName: "Floorcode Zimbabwe",
  registrationNumber: "TEST-0000/0000",
  physicalAddress: "6667 Doma Road, Zimre Park",
  email: "sales@example.invalid",
  phone: "+263 000 000 000",
  bankName: "Test Bank",
  bankBranch: "Test Branch",
  bankBranchCode: "00000",
  bankAddress: "1 Test Street, Harare",
  bankSwiftCode: "TESTZWHX",
  bankAccounts: [
    { currency: "USD", accountName: "Test Account Name", accountNumber: "00000000000000" },
    { currency: "ZWG", accountName: "Test Account Name", accountNumber: "11111111111111" },
  ],
};

const payload: UniversalDocumentPayload = {
  title: "Quotation",
  record: { sections: [] },
};

function render(template: typeof QUOTATION) {
  return renderDocumentHtml({ payload, branding, template });
}

describe("company block", () => {
  for (const [name, template] of [
    ["quotation", QUOTATION],
    ["invoice", INVOICE],
  ] as const) {
    it(`names the trading entity on a ${name}`, () => {
      const html = render(template);
      expect(html).toContain("Code Oho Africa Corporation (Private) Limited");
      expect(html).toContain("t/a Floorcode Zimbabwe");
      expect(html).toContain("6667 Doma Road, Zimre Park");
      expect(html).toContain("sales@example.invalid");
      expect(html).toContain("+263 000 000 000");
    });
  }
});

describe("banking block", () => {
  for (const [name, template] of [
    ["quotation", QUOTATION],
    ["invoice", INVOICE],
  ] as const) {
    it(`carries the bank-level details on a ${name}`, () => {
      const html = render(template);
      expect(html).toContain("Test Bank");
      expect(html).toContain("Branch Code");
      expect(html).toContain("00000");
      expect(html).toContain("1 Test Street, Harare");
      expect(html).toContain("TESTZWHX");
    });

    it(`labels both currency accounts on a ${name}`, () => {
      const html = render(template);
      // Labelled by currency, so nobody pays USD into the ZWG account.
      expect(html).toContain("USD Account No.");
      expect(html).toContain("ZWG Account No.");
      expect(html).toContain("00000000000000");
      expect(html).toContain("11111111111111");
    });
  }

  it("states the bank-level details once, not once per account", () => {
    const html = render(QUOTATION);
    expect(html.split("TESTZWHX").length - 1).toBe(1);
  });

  it("falls back to the single legacy account when none are opted in", () => {
    const html = renderDocumentHtml({
      payload,
      template: QUOTATION,
      branding: {
        ...branding,
        bankAccounts: [],
        bankAccountName: "Legacy Account Name",
        bankAccountNumber: "22222222222222",
      },
    });
    expect(html).toContain("Legacy Account Name");
    expect(html).toContain("22222222222222");
    // No currency prefix: there is only one account to confuse it with.
    expect(html).toContain("Account No.");
    expect(html).not.toContain("USD Account No.");
  });

  it("omits the block entirely when nothing is configured", () => {
    const html = renderDocumentHtml({
      payload,
      template: QUOTATION,
      branding: { displayName: "Floorcode Zimbabwe" },
    });
    expect(html).not.toContain("Payment details");
  });
});

describe("one source of truth for the payment block", () => {
  // The generated document and the public approval page both render these
  // rows. They used to compute them separately, and the approval page went
  // blank the moment a tenant moved to multi-currency accounts, because it
  // read the single legacy field and found it empty. Both now call
  // buildPaymentRows, and this asserts the document really does.
  it("renders exactly the rows the approval page is given", () => {
    const html = render(QUOTATION);
    const rows = buildPaymentRows(branding);

    expect(rows.length).toBeGreaterThan(0);
    for (const { label, value } of rows) {
      expect(html).toContain(label);
      expect(html).toContain(value);
    }
  });

  it("gives the approval page nothing when nothing is configured", () => {
    expect(buildPaymentRows({ displayName: "Floorcode Zimbabwe" })).toEqual([]);
  });
});
