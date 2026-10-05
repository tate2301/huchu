import { NextRequest, NextResponse } from "next/server";

const { validateSessionMock, registerDeviceMock, getDeviceConfigMock, applyMappingMock, prismaMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  registerDeviceMock: vi.fn(),
  getDeviceConfigMock: vi.fn(),
  applyMappingMock: vi.fn(),
  prismaMock: {
    fiscalisationProviderConfig: { findFirst: vi.fn(), update: vi.fn() },
    company: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/api-utils", () => ({
  validateSession: validateSessionMock,
  errorResponse: (message: string, status = 500, details?: unknown) =>
    NextResponse.json({ error: message, ...(details !== undefined ? { details } : {}) }, { status }),
  successResponse: <T,>(data: T, status = 200) => NextResponse.json(data, { status }),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/accounting/fdms-device", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounting/fdms-device")>(
    "@/lib/accounting/fdms-device",
  );
  return { ...actual, registerDevice: registerDeviceMock, getDeviceConfig: getDeviceConfigMock };
});

vi.mock("@/lib/accounting/zimra-tax-mapping", () => ({ applyZimraTaxMapping: applyMappingMock }));

import { SETTINGS_PROVIDER_KEYS } from "@/lib/accounting/fiscal-device-scope";
import { POST } from "./route";

const COMPANY_ID = "company-1";

function request(body: unknown) {
  return new NextRequest("http://test.local/api/accounting/fiscalisation/device/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedInAs(role: string) {
  validateSessionMock.mockResolvedValue({ session: { user: { companyId: COMPANY_ID, role } } });
}

const PROVIDER = {
  id: "provider-1",
  companyId: COMPANY_ID,
  providerKey: "ZIMRA_FDMS",
  deviceId: "12345",
  apiBaseUrl: "http://127.0.0.1:9911",
  certificateRef: null,
  metadataJson: null,
};

const CERTIFICATE = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.company.findUnique.mockResolvedValue({ name: "ACME Inc" });
  prismaMock.fiscalisationProviderConfig.update.mockResolvedValue({ ...PROVIDER, certificateRef: "{}" });
  getDeviceConfigMock.mockResolvedValue({
    status: "SUCCESS",
    data: { applicableTaxes: [{ taxID: 1, taxPercent: 15, taxName: "Standard", validFrom: null, validTill: null }] },
  });
  applyMappingMock.mockResolvedValue({
    mapped: [{ id: "vat", code: "VAT15", zimraTaxId: 1 }],
    ambiguous: [],
    unmatched: ["EXEMPT"],
  });
});

describe("POST /api/accounting/fiscalisation/device/register", () => {
  it("is a manager's to do", async () => {
    signedInAs("CASHIER");
    const response = await POST(request({ activationKey: "00112233", serialNumber: "SN-1" }));
    expect(response.status).toBe(403);
    expect(registerDeviceMock).not.toHaveBeenCalled();
  });

  it("in a shop, is the owner's to do: the manager reads the fiscal device", async () => {
    validateSessionMock.mockResolvedValue({
      session: { user: { companyId: COMPANY_ID, role: "MANAGER", workspaceProfile: "RETAIL" } },
    });
    const response = await POST(request({ activationKey: "00112233", serialNumber: "SN-1" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Your role cannot change the fiscal device");
    expect(prismaMock.fiscalisationProviderConfig.findFirst).not.toHaveBeenCalled();
  });

  it("looks for a device, never a retail settings row", async () => {
    signedInAs("MANAGER");
    prismaMock.fiscalisationProviderConfig.findFirst.mockResolvedValue(null);

    const response = await POST(request({ activationKey: "00112233", serialNumber: "SN-1" }));

    expect(response.status).toBe(400);
    expect(prismaMock.fiscalisationProviderConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: COMPANY_ID,
          isActive: true,
          providerKey: { notIn: [...SETTINGS_PROVIDER_KEYS] },
        },
      }),
    );
  });

  it("sends a certificate request with the activation key, and keeps the key with the certificate", async () => {
    signedInAs("MANAGER");
    prismaMock.fiscalisationProviderConfig.findFirst.mockResolvedValue(PROVIDER);
    registerDeviceMock.mockResolvedValue({
      status: "SUCCESS",
      data: { certificatePem: CERTIFICATE, certificateChainPem: [] },
      error: null,
    });

    const response = await POST(request({ activationKey: "00112233", serialNumber: "SN-1" }));

    expect(response.status).toBe(200);
    const call = registerDeviceMock.mock.calls[0][0];
    expect(call.activationKey).toBe("00112233");
    expect(call.certificateRequestPem).toMatch(/BEGIN CERTIFICATE REQUEST/);

    const saved = prismaMock.fiscalisationProviderConfig.update.mock.calls[0][0];
    expect(saved.where).toEqual({ id: PROVIDER.id });
    const bundle = JSON.parse(saved.data.certificateRef);
    expect(bundle.key).toMatch(/PRIVATE KEY/);
    expect(bundle.cert).toMatch(/BEGIN CERTIFICATE/);

    // The shop's tax codes are mapped onto the device's taxes, so a sale can be signed.
    expect(applyMappingMock).toHaveBeenCalledWith(COMPANY_ID, [
      expect.objectContaining({ taxID: 1, taxPercent: 15 }),
    ]);
    const body = await response.json();
    expect(body.taxCodesMapped).toEqual(["VAT15"]);
    expect(body.taxCodesNotMapped).toEqual(["EXEMPT"]);

    // The key stays on the server.
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE KEY/);
  });

  it("stores nothing when ZIMRA refuses", async () => {
    signedInAs("SUPERADMIN");
    prismaMock.fiscalisationProviderConfig.findFirst.mockResolvedValue(PROVIDER);
    registerDeviceMock.mockResolvedValue({ status: "FAILED", data: null, error: "Activation key already used" });

    const response = await POST(request({ activationKey: "00112233", serialNumber: "SN-1" }));

    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Activation key already used");
    expect(prismaMock.fiscalisationProviderConfig.update).not.toHaveBeenCalled();
  });
});
