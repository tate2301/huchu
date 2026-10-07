import { NextRequest, NextResponse } from "next/server";

/**
 * In a shop, which account each tender posts to is the Roles board's Posting
 * to the books row: the owner and the bookkeeper read it, the manager does not
 * reach the books (80-admin 3.1, ADM-01). Other products keep the route open.
 */

const { validateSessionMock, findManyMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/api-utils", () => ({
  validateSession: validateSessionMock,
  errorResponse: (message: string, status = 500) => NextResponse.json({ error: message }, { status }),
  successResponse: <T,>(data: T, status = 200) => NextResponse.json(data, { status }),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { tenderAccountMapping: { findMany: findManyMock } } }));

import { GET } from "./route";

function signedInAs(role: string, enabledFeatures = ["retail.core"]) {
  validateSessionMock.mockResolvedValue({ session: { user: { companyId: "company-1", role, enabledFeatures } } });
}

const read = () => GET(new NextRequest("http://test.local/api/accounting/tender-mappings"));

beforeEach(() => {
  vi.clearAllMocks();
  findManyMock.mockResolvedValue([{ tenderType: "CASH" }]);
});

describe("GET /api/accounting/tender-mappings", () => {
  it.each(["MANAGER", "SHOP_MANAGER", "CASHIER", "STOCK_CLERK"])("in a shop, refuses %s", async (role) => {
    signedInAs(role);
    const response = await read();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Your role cannot view posting to the books");
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it.each(["SUPERADMIN", "FINANCE_OFFICER"])("in a shop, lists them for %s", async (role) => {
    signedInAs(role);
    const response = await read();
    expect(response.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "company-1" } }));
  });

  it("outside a shop, lists them for the manager", async () => {
    signedInAs("MANAGER", ["accounting.core"]);
    expect((await read()).status).toBe(200);
  });
});
