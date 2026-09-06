import { describe, expect, it } from "vitest";

import { deriveLeadChannel } from "@/lib/crm/sources";

describe("deriveLeadChannel", () => {
  it("honors a valid explicit channel above everything", () => {
    expect(
      deriveLeadChannel({ explicitChannel: "SOCIAL", utmMedium: "cpc", origin: "WEBHOOK" }),
    ).toBe("SOCIAL");
    expect(deriveLeadChannel({ explicitChannel: "ads", origin: "MANUAL" })).toBe("ADS");
  });

  it("classifies paid mediums as ADS", () => {
    expect(deriveLeadChannel({ utmMedium: "cpc", utmSource: "google", origin: "WEB_FORM" })).toBe("ADS");
    expect(deriveLeadChannel({ utmMedium: "paid_social", utmSource: "facebook", origin: "WEBHOOK" })).toBe("ADS");
  });

  it("classifies organic social sources as SOCIAL", () => {
    expect(deriveLeadChannel({ utmSource: "instagram", origin: "WEB_FORM" })).toBe("SOCIAL");
    expect(deriveLeadChannel({ source: "WhatsApp", origin: "MANUAL" })).toBe("SOCIAL");
    expect(deriveLeadChannel({ source: "facebook", origin: "WEBHOOK" })).toBe("SOCIAL");
  });

  it("detects referrals", () => {
    expect(deriveLeadChannel({ source: "customer referral", origin: "MANUAL" })).toBe("REFERRAL");
    expect(deriveLeadChannel({ utmMedium: "referral", origin: "WEB_FORM" })).toBe("REFERRAL");
  });

  it("falls back to the capture origin", () => {
    expect(deriveLeadChannel({ origin: "MANUAL" })).toBe("MANUAL");
    expect(deriveLeadChannel({ origin: "WEB_FORM" })).toBe("WEB_FORM");
    expect(deriveLeadChannel({ origin: "WEBHOOK", source: "zapier" })).toBe("WEBHOOK");
  });

  it("ignores invalid explicit channels", () => {
    expect(deriveLeadChannel({ explicitChannel: "carrier-pigeon", origin: "WEBHOOK" })).toBe("WEBHOOK");
  });
});
