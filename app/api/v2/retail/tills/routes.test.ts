import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The tills routes refuse roles the Roles board does not give "Tills and
 * devices" (10-setup 4.3, acceptance: a cashier gets 403) and check every
 * body before anything is written. The services behind them are tested in
 * `lib/retail/tills.test.ts`.
 */

const session = { role: "CASHIER" };
vi.mock("@/app/api/v2/retail/_helpers", () => ({
  requireRetailSession: async () => ({
    response: null,
    session: { user: { id: randomUUID(), companyId: randomUUID(), name: "Someone", role: session.role } },
  }),
}));

const { GET: list, POST: create } = await import("./route");
const { GET: read, PATCH: change, DELETE: remove } = await import("./[id]/route");
const { POST: issue, DELETE: cancel } = await import("./[id]/pairing-code/route");
const { GET: pairing } = await import("./[id]/pairing/route");
const { POST: unpair } = await import("./[id]/unpair/route");
const { POST: message } = await import("./messages/route");

const url = (path: string) => `http://shop.test/api/v2/retail/tills${path}`;
const request = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(url(path), {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  session.role = "CASHIER";
});

describe("who may use the tills routes", () => {
  it("refuses a cashier, a stock clerk and a bookkeeper on every handler", async () => {
    const id = randomUUID();
    for (const role of ["CASHIER", "STOCK_CLERK", "FINANCE_OFFICER"]) {
      session.role = role;
      const answers = await Promise.all([
        list(request("")),
        create(request("", "POST", { deviceKind: "COUNTER_MINI" })),
        read(request(`/${id}`), params(id)),
        change(request(`/${id}`, "PATCH", { name: "Front till" }), params(id)),
        remove(request(`/${id}`, "DELETE"), params(id)),
        issue(request(`/${id}/pairing-code`, "POST", { purpose: "PAIR" }), params(id)),
        cancel(request(`/${id}/pairing-code`, "DELETE"), params(id)),
        pairing(request(`/${id}/pairing`), params(id)),
        unpair(request(`/${id}/unpair`, "POST"), params(id)),
        message(request("/messages", "POST", { tillIds: [id], body: "Hello" })),
      ]);
      expect(answers.map((answer) => answer.status)).toEqual(Array(10).fill(403));
    }
  });
});

describe("what the routes check before writing", () => {
  beforeEach(() => {
    session.role = "MANAGER";
  });

  it("refuses a body that is not a till's", async () => {
    const bad = await create(request("", "POST", { deviceKind: "TABLET" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ fieldErrors: { deviceKind: "Choose CounterMini, Kora handheld or a browser." } });

    const id = randomUUID();
    const empty = await change(request(`/${id}`, "PATCH", { name: "  " }), params(id));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ fieldErrors: { name: "Name is needed." } });

    const purpose = await issue(request(`/${id}/pairing-code`, "POST", { purpose: "STEAL" }), params(id));
    expect(purpose.status).toBe(400);

    const long = await message(request("/messages", "POST", { tillIds: [id], body: "x".repeat(281) }));
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ fieldErrors: { body: "Keep the message to 280 characters." } });
  });

  it("answers 404 for an id that is not a till's, and for another shop's till", async () => {
    expect((await read(request("/nope"), params("nope"))).status).toBe(404);
    const id = randomUUID();
    expect((await read(request(`/${id}`), params(id))).status).toBe(404);
    expect((await unpair(request(`/${id}/unpair`, "POST"), params(id))).status).toBe(404);
    expect((await pairing(request(`/${id}/pairing`), params(id))).status).toBe(404);
  });

  it("lets a manager read the list", async () => {
    const answer = await list(request("?state=SELLING"));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ data: [], totals: { count: 0 } });
  });
});
