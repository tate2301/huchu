import { describe, expect, it } from "vitest";

import { buildDocumentEmail, resolveRecipient } from "@/lib/crm/document-email";
import { formatFromHeader } from "@/lib/email/send";

describe("resolveRecipient", () => {
  /*
    The customer on the accounting record is the party named on the paper.
    Falling back to the lead's original enquiry address once an account exists
    is how an invoice reaches whoever first filled in a web form rather than
    the finance desk that has to pay it.
  */
  it("prefers the customer on the document over the CRM contact", () => {
    expect(
      resolveRecipient({
        customerEmail: "accounts@client.example",
        clientEmail: "office@client.example",
        contactEmail: "enquiries@client.example",
      }),
    ).toBe("accounts@client.example");
  });

  it("falls back to the client, then the original contact", () => {
    expect(
      resolveRecipient({ clientEmail: "office@client.example", contactEmail: "e@client.example" }),
    ).toBe("office@client.example");
    expect(resolveRecipient({ contactEmail: "e@client.example" })).toBe("e@client.example");
  });

  it("falls back to the deal's primary contact before the lead's enquiry address", () => {
    expect(
      resolveRecipient({ primaryContactEmail: "tendai@client.example", contactEmail: "e@client.example" }),
    ).toBe("tendai@client.example");
    expect(
      resolveRecipient({ clientEmail: "office@client.example", primaryContactEmail: "tendai@client.example" }),
    ).toBe("office@client.example");
  });

  it("treats blank and whitespace as absent rather than sending to nobody", () => {
    expect(resolveRecipient({ customerEmail: "   ", clientEmail: "", contactEmail: null })).toBeNull();
    expect(resolveRecipient({})).toBeNull();
  });

  it("trims an address somebody pasted with a trailing space", () => {
    expect(resolveRecipient({ customerEmail: " accounts@client.example " })).toBe(
      "accounts@client.example",
    );
  });
});

describe("formatFromHeader", () => {
  /*
    Parentheses are comment syntax in an address header, and plenty of
    Zimbabwean trading names carry "(Pvt) Ltd". Unquoted, the name is silently
    eaten and the customer sees a bare platform address.
  */
  it("quotes a display name so punctuation survives", () => {
    expect(formatFromHeader("Mabvuku Hardware (Pvt) Ltd", "no-reply@platform.test")).toBe(
      '"Mabvuku Hardware (Pvt) Ltd" <no-reply@platform.test>',
    );
  });

  it("escapes quotes and backslashes so a name cannot break out of the header", () => {
    expect(formatFromHeader('Ace "The Yard" Ltd', "no-reply@platform.test")).toBe(
      '"Ace \\"The Yard\\" Ltd" <no-reply@platform.test>',
    );
    expect(formatFromHeader("Back\\slash", "no-reply@platform.test")).toBe(
      '"Back\\\\slash" <no-reply@platform.test>',
    );
  });

  it("strips newlines, which would otherwise inject a header", () => {
    const header = formatFromHeader("Evil\r\nBcc: someone@else.test", "no-reply@platform.test");
    expect(header).not.toContain("\n");
    expect(header).not.toContain("\r");
  });

  it("falls back to the bare address when there is no name", () => {
    expect(formatFromHeader("   ", "no-reply@platform.test")).toBe("no-reply@platform.test");
  });
});

describe("buildDocumentEmail", () => {
  const base = {
    number: "QUO-2026-0088",
    companyName: "Floorcode Zimbabwe",
    amount: "USD 9,717.50",
    approvalUrl: "https://app.test/a/tok",
  };

  it("names the document and the sender in the subject", () => {
    const mail = buildDocumentEmail({ ...base, kind: "QUOTATION" });
    expect(mail.subject).toBe("Quotation QUO-2026-0088 from Floorcode Zimbabwe");
  });

  it("carries the approval link in both the text and the HTML part", () => {
    const mail = buildDocumentEmail({ ...base, kind: "INVOICE" });
    expect(mail.text).toContain("https://app.test/a/tok");
    expect(mail.html).toContain('href="https://app.test/a/tok"');
  });

  it("asks a receipt to be viewed, not responded to", () => {
    const mail = buildDocumentEmail({ ...base, kind: "RECEIPT" });
    expect(mail.text).toContain("view it here");
    expect(mail.text).not.toContain("respond");
  });

  it("escapes the company name in the HTML part", () => {
    const mail = buildDocumentEmail({
      ...base,
      kind: "QUOTATION",
      companyName: 'Ace <script>alert(1)</script> Ltd',
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("buildDocumentEmail with the rep's own words", () => {
  const base = {
    kind: "QUOTATION" as const,
    number: "QT-0402",
    companyName: "Floorcode Zimbabwe",
    amount: "USD 919.17",
    approvalUrl: "https://app.test/a/tok",
  };

  it("says what the document is, for what, when the rep writes nothing", () => {
    const mail = buildDocumentEmail(base);
    expect(mail.text.split("\n")[0]).toBe("Please find our quotation QT-0402 for USD 919.17 attached.");
  });

  it("sends their subject and note, and the link to answer still follows", () => {
    const mail = buildDocumentEmail({
      ...base,
      subject: "Your lounge and passage, fitted",
      message: "Good afternoon.\n\nHere is the quote for 27.92 m² of oak laminate, fitted.\nIt holds for 30 days.",
    });
    expect(mail.subject).toBe("Your lounge and passage, fitted");
    expect(mail.text.startsWith("Good afternoon.\n\nHere is the quote")).toBe(true);
    expect(mail.text).not.toContain("Please find our");
    expect(mail.text).toContain("https://app.test/a/tok");
    expect(mail.html).toContain("<p>Good afternoon.</p>");
    expect(mail.html).toContain("fitted.<br>It holds for 30 days.</p>");
    expect(mail.html).toContain('href="https://app.test/a/tok"');
  });

  it("escapes what they wrote in the HTML part", () => {
    const mail = buildDocumentEmail({ ...base, message: "See <a href=x>here</a>" });
    expect(mail.html).not.toContain("<a href=x>");
    expect(mail.html).toContain("&lt;a href=x&gt;");
  });

  it("falls back to the usual subject and note when theirs is blank", () => {
    const mail = buildDocumentEmail({ ...base, subject: "  ", message: "\n" });
    expect(mail.subject).toBe("Quotation QT-0402 from Floorcode Zimbabwe");
    expect(mail.text).toContain("Please find our quotation QT-0402");
  });
});

describe("buildDocumentEmail with resources to review", () => {
  const base = {
    number: "QUO-2026-0088",
    companyName: "Floorcode Zimbabwe",
    amount: "USD 9,717.50",
    approvalUrl: "https://app.test/a/tok",
  };
  const resources = [
    {
      title: "Floorcode brochure",
      description: "Finishes, colours and where they have been laid",
      url: "https://example.invalid/brochure.pdf",
    },
    { title: "Resin data sheet", description: null, url: "https://example.invalid/resin" },
  ];

  it("lists each one after the link, with its address written out", () => {
    const mail = buildDocumentEmail({ ...base, kind: "QUOTATION", resources });
    expect(mail.text).toContain("Review before you accept:");
    expect(mail.text).toContain("- Floorcode brochure: https://example.invalid/brochure.pdf");
    expect(mail.text).toContain("  Finishes, colours and where they have been laid");
    expect(mail.text).toContain("- Resin data sheet: https://example.invalid/resin");
    // After the approval link, before the sign-off.
    expect(mail.text.indexOf("Review before you accept")).toBeGreaterThan(
      mail.text.indexOf("https://app.test/a/tok"),
    );
    expect(mail.text.trimEnd().endsWith("Floorcode Zimbabwe")).toBe(true);
  });

  it("links each one in the HTML part", () => {
    const mail = buildDocumentEmail({ ...base, kind: "QUOTATION", resources });
    expect(mail.html).toContain('<a href="https://example.invalid/brochure.pdf">Floorcode brochure</a>');
    expect(mail.html).toContain('<a href="https://example.invalid/resin">Resin data sheet</a>');
  });

  it("offers them on an invoice for reference", () => {
    const mail = buildDocumentEmail({ ...base, kind: "INVOICE", resources });
    expect(mail.text).toContain("For your reference:");
    expect(mail.text).not.toContain("before you accept");
  });

  it("escapes what a tenant typed into a title", () => {
    const mail = buildDocumentEmail({
      ...base,
      kind: "QUOTATION",
      resources: [{ title: "<b>Brochure</b>", description: null, url: "https://example.invalid/x" }],
    });
    expect(mail.html).not.toContain("<b>Brochure</b>");
    expect(mail.html).toContain("&lt;b&gt;Brochure&lt;/b&gt;");
  });

  it("says nothing about resources when none were offered", () => {
    const mail = buildDocumentEmail({ ...base, kind: "QUOTATION", resources: [] });
    expect(mail.text).not.toContain("Review before you accept");
    expect(mail.html).not.toContain("<ul");
  });
});
