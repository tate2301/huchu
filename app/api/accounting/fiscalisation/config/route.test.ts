import { NextRequest, NextResponse } from "next/server";

/**
 * In a shop the fiscal device is the Roles board's Fiscal device row: the owner
 * changes it, the manager and the bookkeeper read it (80-admin 3.1, ADM-01).
 * Other products have only ever checked the session here.
 */

const { validateSessionMock, prismaMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  prismaMock: {
    fiscalisationProviderConfig: { findFirst: vi.fn(), upsert: vi.fn() },
    accountingSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock("@/lib/api-utils", () => ({
  validateSession: validateSessionMock,
  errorResponse: (message: string, status = 500, details?: unknown) =>
    NextResponse.json({ error: message, ...(details !== undefined ? { details } : {}) }, { status }),
  successResponse: <T,>(data: T, status = 200) => NextResponse.json(data, { status }),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, POST } from "./route";

const COMPANY_ID = "company-1";
const URL = "http://test.local/api/accounting/fiscalisation/config";

function signedInAs(role: string, workspaceProfile = "RETAIL") {
  validateSessionMock.mockResolvedValue({ session: { user: { companyId: COMPANY_ID, role, workspaceProfile } } });
}

function save(body: unknown = { providerKey: "ZIMRA_FDMS", deviceId: "12345" }) {
  return POST(
    new NextRequest(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.fiscalisationProviderConfig.findFirst.mockResolvedValue(null);
  prismaMock.accountingSettings.findUnique.mockResolvedValue(null);
  prismaMock.fiscalisationProviderConfig.upsert.mockResolvedValue({ id: "provider-1" });
});

describe("POST /api/accounting/fiscalisation/config", () => {
  it.each(["MANAGER", "SHOP_MANAGER", "FINANCE_OFFICER", "CASHIER"])(
    "in a shop, refuses %s before reading the body",
    async (role) => {
      signedInAs(role);
      const response = await save({ not: "a config" });
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe("Your role cannot change the fiscal device");
      expect(prismaMock.fiscalisationProviderConfig.upsert).not.toHaveBeenCalled();
    },
  );

  it("in a shop, saves for the owner", async () => {
    signedInAs("SUPERADMIN");
    const response = await save();
    expect(response.status).toBe(201);
    expect(prismaMock.fiscalisationProviderConfig.upsert).toHaveBeenCalled();
  });

  it("outside a shop, keeps the session check alone", async () => {
    signedInAs("MANAGER", "GOLD_MINE");
    const response = await save();
    expect(response.status).toBe(201);
  });
});

describe("GET /api/accounting/fiscalisation/config", () => {
  it("tells the page whether the caller may change the device", async () => {
    signedInAs("MANAGER");
    expect((await (await GET(new NextRequest(URL))).json()).canEdit).toBe(false);
    signedInAs("FINANCE_OFFICER");
    expect((await (await GET(new NextRequest(URL))).json()).canEdit).toBe(false);
    signedInAs("SUPERADMIN");
    expect((await (await GET(new NextRequest(URL))).json()).canEdit).toBe(true);
  });
});
