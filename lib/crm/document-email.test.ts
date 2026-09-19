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
