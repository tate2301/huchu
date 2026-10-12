import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Who may book a return to a supplier (STK-09): a cashier takes bottles back
 * at the till and nothing more, so the return route refuses them before it
 * reads the body; a stock clerk gets past the gate to the field checks.
 */

const who = { role: "CASHIER" };

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: "user-1", companyId: "company-1", name: "Chipo Dube", role: who.role } },
    }),
  };
});

const { POST } = await import("./route");

const post = (body: unknown) =>
  new NextRequest("http://shop.test/api/v2/retail/empties/returns", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/v2/retail/empties/returns", () => {
  it("refuses a cashier", async () => {
    who.role = "CASHIER";
    const response = await POST(post({ supplierId: "s", bottles: 1, crates: 0, goingBackWith: "Their truck" }));
    expect(response.status).toBe(403);
  });

  it("lets a stock clerk through to the field checks", async () => {
    who.role = "STOCK_CLERK";
    const response = await POST(post({}));
    expect(response.status).toBe(400);
  });
});
