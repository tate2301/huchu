import { NextRequest, NextResponse } from "next/server";

/**
 * In a shop, setting up the accounts is the Roles board's Posting to the books
 * row: the owner and the bookkeeper change it, the manager does not reach the
 * books (80-admin 3.1, ADM-01).
 */

const { validateSessionMock, previewMock, runMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  previewMock: vi.fn(),
  runMock: vi.fn(),
}));

vi.mock("@/lib/api-utils", () => ({
  validateSession: validateSessionMock,
  errorResponse: (message: string, status = 500, details?: unknown) =>
    NextResponse.json({ error: message, ...(details !== undefined ? { details } : {}) }, { status }),
  successResponse: <T,>(data: T, status = 200) => NextResponse.json(data, { status }),
}));

vi.mock("@/lib/accounting/bootstrap", () => ({
  previewAccountingSeedPack: previewMock,
  runAccountingSeedPack: runMock,
}));

import { POST } from "./route";

function signedInAs(role: string, workspaceProfile = "RETAIL") {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: "user-1", email: "a@b.test", companyId: "company-1", role, workspaceProfile } },
  });
}

function run(mode: "DRY_RUN" | "APPLY") {
  return POST(
    new NextRequest("http://test.local/api/accounting/setup/seed-pack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  previewMock.mockResolvedValue({ mode: "DRY_RUN" });
  runMock.mockResolvedValue({ mode: "APPLY" });
});

describe("POST /api/accounting/setup/seed-pack", () => {
  it.each(["MANAGER", "SHOP_MANAGER", "CASHIER", "STOCK_CLERK"])("in a shop, refuses %s", async (role) => {
    signedInAs(role);
    const response = await run("APPLY");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Your role cannot change posting to the books");
    expect(runMock).not.toHaveBeenCalled();
  });

  it.each(["SUPERADMIN", "FINANCE_OFFICER"])("in a shop, sets the accounts up for %s", async (role) => {
    signedInAs(role);
    expect((await run("APPLY")).status).toBe(200);
    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1", mode: "APPLY" }));
  });

  it("outside a shop, keeps the manager and refuses the finance officer", async () => {
    signedInAs("MANAGER", "GOLD_MINE");
    expect((await run("DRY_RUN")).status).toBe(200);
    signedInAs("FINANCE_OFFICER", "GOLD_MINE");
    expect((await run("DRY_RUN")).status).toBe(403);
  });
});
