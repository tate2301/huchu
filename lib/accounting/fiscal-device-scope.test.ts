import { describe, expect, it } from "vitest";

import { RETAIL_POS_POLICY_PROVIDER_KEY } from "@/lib/retail/pos-policy";
import { POLICY_PROVIDER_KEY } from "@/lib/retail/tender-policy";

import { fiscalDeviceWhere, isFiscalDeviceKey, SETTINGS_PROVIDER_KEYS } from "./fiscal-device-scope";

describe("fiscal device scope", () => {
  it("names every retail settings row", () => {
    expect([...SETTINGS_PROVIDER_KEYS].sort()).toEqual(
      [RETAIL_POS_POLICY_PROVIDER_KEY, POLICY_PROVIDER_KEY].sort(),
    );
  });

  it("keeps settings rows out of a device lookup", () => {
    expect(fiscalDeviceWhere("company-1")).toEqual({
      companyId: "company-1",
      isActive: true,
      providerKey: { notIn: [...SETTINGS_PROVIDER_KEYS] },
    });
    expect(isFiscalDeviceKey("RETAIL_POS_POLICY")).toBe(false);
    expect(isFiscalDeviceKey("ZIMRA_FDMS")).toBe(true);
  });
});
