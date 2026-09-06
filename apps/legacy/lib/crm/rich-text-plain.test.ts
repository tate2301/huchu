import { describe, it, expect } from "vitest";
import { richTextToPlain } from "@/lib/crm/rich-text";

describe("richTextToPlain", () => {
  it("reads a mention as the person's name, not its token", () => {
    expect(richTextToPlain("Spoke to @[Sarah Moyo](7f1c9f2e-1111-4222-8333-444455556666) today"))
      .toBe("Spoke to Sarah Moyo today");
  });
  it("drops emphasis markers a subject line cannot render", () => {
    expect(richTextToPlain("**urgent** — call *back*")).toBe("urgent — call back");
  });
  it("truncates without cutting mid-token", () => {
    const long = "a".repeat(300);
    const out = richTextToPlain(long, 50);
    expect(out.length).toBe(50);
    expect(out.endsWith("…")).toBe(true);
  });
});
