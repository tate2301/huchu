/** What the Vane panel offers to ask next: always three, the record on screen first. */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({}) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));

const { vaneSuggestions } = await import("./vane-panel");

describe("Vane's suggestions", () => {
  it("asks about the deal on screen first, then offers a quote from the price list, then the module's questions", () => {
    const suggestions = vaneSuggestions([], "crm", "/crm/deals/9f1c");
    expect(suggestions.map((row) => row.text)).toEqual([
      "What should I do next on this deal?",
      "Draft a quote for this deal from our price list",
      "Which quotes have waited more than a week?",
    ]);
    expect(suggestions[0]).toMatchObject({ module: "crm", icon: "foryou" });
  });

  it("asks what stands out on a report's page", () => {
    expect(vaneSuggestions([], "reports", "/reports/crm-deals")[0]).toMatchObject({ text: "What stands out in this report?", icon: "reports", module: "reports" });
  });

  it("asks about a knowledge document on its page", () => {
    expect(vaneSuggestions([], "crm", "/crm/knowledge/k1")[0]).toMatchObject({ text: "What does this document say we charge?", module: "crm" });
  });

  it("is always three, from anywhere", () => {
    expect(vaneSuggestions([], null, "/settings/profile")).toHaveLength(3);
    expect(vaneSuggestions([], "crm", "/crm/deals")[0]?.text).toBe("Which quotes have waited more than a week?");
  });
});
