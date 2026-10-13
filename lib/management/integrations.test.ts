import { describe, expect, it } from "vitest";

import { readIntegrations } from "./integrations";

function db(over: Partial<Record<string, unknown>> = {}) {
  const none = async () => null;
  return {
    fiscalisationProviderConfig: { findFirst: async () => over.fiscal ?? null },
    retailPaymentSettings: { findUnique: async () => over.payments ?? null },
    crmFacebookConnection: { findFirst: async () => over.facebook ?? null },
    bankAccount: { findMany: async () => over.accounts ?? [] },
    bankStatementLine: { findFirst: over.lastLine ? async () => over.lastLine : none },
  } as unknown as Parameters<typeof readIntegrations>[0];
}

const now = new Date("2026-10-13T08:00:00Z");

describe("Management → Integrations", () => {
  it("lists what the workspace runs, connected or not", async () => {
    const view = await readIntegrations(db(), "c", { features: ["crm.deals"], whatsappConfigured: false, now });
    expect(view.connected).toEqual([]);
    expect(view.available.map((item) => item.key)).toEqual(["whatsapp", "facebook"]);
    expect(view.attention).toBeNull();
  });

  it("calls a bank statement due after a week, and says so first", async () => {
    const view = await readIntegrations(
      db({ accounts: [{ name: "CBZ USD", bankName: "CBZ" }], lastLine: { txnDate: new Date("2026-10-02T00:00:00Z") } }),
      "c",
      { features: ["accounting.banking"], whatsappConfigured: true, now },
    );
    const bank = view.connected.find((item) => item.key === "bank");
    expect(bank).toMatchObject({ name: "CBZ statements", state: "due", action: "Upload" });
    expect(view.attention).toBe("The CBZ statements are due, so new bank lines wait in Books.");
  });

  it("marks a fiscal device failing when its last receipt failed after its last success", async () => {
    const view = await readIntegrations(
      db({ fiscal: { serialNumber: "SN1", registeredAt: now, lastOkAt: new Date("2026-10-10"), lastFailedAt: new Date("2026-10-12") } }),
      "c",
      { features: ["accounting.vat"], whatsappConfigured: false, now },
    );
    expect(view.connected.find((item) => item.key === "fiscal")).toMatchObject({ state: "failing", action: "Fix" });
  });
});
