import { describe, expect, it, vi } from "vitest";

import type { FiscalisationProviderConfig } from "@prisma/client";

import { buildFiscalDayCanonicalString, closeDayOnDevice, type FdmsDeviceTransport } from "./fdms-device";
import { fdmsDeviceId } from "./fdms-receipt-signing";

const COUNTERS = [
  { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "USD", fiscalCounterTaxID: 1, fiscalCounterTaxPercent: "15.50", fiscalCounterValueCents: "128450" },
  { fiscalCounterType: "SaleTaxByTax", fiscalCounterCurrency: "USD", fiscalCounterTaxID: 1, fiscalCounterTaxPercent: "15.50", fiscalCounterValueCents: "17237" },
  { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "USD", fiscalCounterTaxID: 3, fiscalCounterTaxPercent: null, fiscalCounterValueCents: "0" },
];

describe("a fiscal day's Z-report", () => {
  it("reads a grouped device ID as its digits", () => {
    expect(fdmsDeviceId(" 0441-2209 ")).toBe("04412209");
    expect(fdmsDeviceId(12345)).toBe("12345");
  });

  it("signs the device, the day, its date and every counter that is not zero, upper case and in order", () => {
    expect(
      buildFiscalDayCanonicalString({ deviceId: "0441-2209", fiscalDayNo: 214, fiscalDayDate: "2026-10-03", counters: COUNTERS }),
    ).toBe("44122092142026-10-03SALEBYTAXUSD15.50128450SALETAXBYTAXUSD15.5017237");
  });

  it("goes to the device's CloseDay with its counters and signature, once per day", async () => {
    const issue = vi.fn().mockResolvedValue({ status: "SUCCESS", rawResponseJson: '{"operationID":"op-1"}' });
    const transport = { issue, sync: vi.fn() } as unknown as FdmsDeviceTransport;
    const provider = { id: "p1", companyId: "c1", deviceId: "0441-2209", metadataJson: null } as FiscalisationProviderConfig;
    const result = await closeDayOnDevice(
      { provider, fiscalDayNo: 214, receiptCounter: 31, counters: COUNTERS, signature: { hash: "h", signature: "s" } },
      transport,
    );
    expect(result).toMatchObject({ status: "SUCCESS", operationId: "op-1" });
    const call = issue.mock.calls[0]![0];
    expect(JSON.parse(call.provider.metadataJson).issuePath).toBe("/Device/v1/04412209/CloseDay");
    expect(call.payload.idempotencyKey).toBe("c1:close-day:04412209:214");
    expect(call.payload.payload).toMatchObject({
      fiscalDayNo: 214,
      receiptCounter: 31,
      fiscalDayDeviceSignature: { hash: "h", signature: "s" },
    });
    expect(call.payload.payload.fiscalDayCounters[0]).toEqual({
      fiscalCounterType: "SaleByTax",
      fiscalCounterCurrency: "USD",
      fiscalCounterTaxID: 1,
      fiscalCounterTaxPercent: "15.50",
      fiscalCounterValue: "128450",
    });
  });
});
