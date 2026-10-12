/**
 * The order's signed link (40-buying 4.10): HMAC-SHA256 over `<id>.<expiry>`
 * with NEXTAUTH_SECRET, good until it runs out, refused when tampered with.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { checkDocumentToken, ORDER_LINK_DAYS, orderPdfLink, signDocumentToken } from "./documents";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
});

describe("a document link", () => {
  const id = "0b9a3e1c-6c4f-4d2a-9b70-4e2d6f0f1a11";

  it("opens the order it was signed for until it runs out", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    const token = signDocumentToken(id, new Date(now.getTime() + ORDER_LINK_DAYS * 86_400_000));
    expect(checkDocumentToken(id, token, now)).toBe("ok");
    expect(checkDocumentToken(id, token, new Date(now.getTime() + 31 * 86_400_000))).toBe("expired");
  });

  it("refuses another order's token and a tampered one", () => {
    const token = signDocumentToken(id, new Date("2026-11-06T10:00:00Z"));
    expect(checkDocumentToken("1b9a3e1c-6c4f-4d2a-9b70-4e2d6f0f1a11", token)).toBe("bad");
    expect(checkDocumentToken(id, token.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe("bad");
    expect(checkDocumentToken(id, "nonsense")).toBe("bad");
  });

  it("puts the token on the order's PDF address", () => {
    const link = orderPdfLink({ id, slug: "hurudza-creative", requestUrl: "http://localhost:3000/retail/buying/orders" });
    expect(link).toMatch(new RegExp(`^http://localhost:3000/api/v2/retail/records/RetailPurchaseOrder/${id}/pdf\\?token=\\d+\\.`));
  });
});
