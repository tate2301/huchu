import { NextRequest, NextResponse } from "next/server";

/**
 * In a shop, the setup checks are the Roles board's Posting to the books row:
 * the owner and the bookkeeper read them, the manager does not reach the books
 * (80-admin 3.1, ADM-01). Other products keep the route open.
 */

const { validateSessionMock, readinessMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  readinessMock: vi.fn(),
}));

vi.mock("@/lib/api-utils", () => ({
  validateSession: validateSessionMock,
  errorResponse: (message: string, status = 500) => NextResponse.json({ error: message }, { status }),
  successResponse: <T,>(data: T, status = 200) => NextResponse.json(data, { status }),
}));

vi.mock("@/lib/accounting/bootstrap", () => ({ getAccountingSetupReadiness: readinessMock }));

import { GET } from "./route";

function signedInAs(role: string, enabledFeatures = ["retail.core"]) {
  validateSessionMock.mockResolvedValue({ session: { user: { companyId: "company-1", role, enabledFeatures } } });
}

const read = () => GET(new NextRequest("http://test.local/api/accounting/setup/readiness"));

beforeEach(() => {
  vi.clearAllMocks();
  readinessMock.mockResolvedValue({ ready: false, checks: [] });
});

describe("GET /api/accounting/setup/readiness", () => {
  it.each(["MANAGER", "SHOP_MANAGER", "CASHIER", "STOCK_CLERK"])("in a shop, refuses %s", async (role) => {
    signedInAs(role);
    const response = await read();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Your role cannot view posting to the books");
    expect(readinessMock).not.toHaveBeenCalled();
  });

  it.each(["SUPERADMIN", "FINANCE_OFFICER"])("in a shop, answers %s and offers the set-up", async (role) => {
    signedInAs(role);
    const response = await read();
    expect(response.status).toBe(200);
    expect((await response.json()).canSetUp).toBe(true);
  });

  it("outside a shop, answers the manager", async () => {
    signedInAs("MANAGER", ["accounting.core"]);
    const response = await read();
    expect(response.status).toBe(200);
    expect((await response.json()).canSetUp).toBe(true);
  });
});
