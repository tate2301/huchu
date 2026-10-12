import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Waiting now" for requisitions (80-admin 4.2, BUY-04): the ones this person
 * may decide, oldest first, worded "REQ-0014, US$1,940.00, for Afdis.".
 */

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { crmRequisition: { findMany: (...args: unknown[]) => findMany(...args) } } }));

import { requisitionsWaiting } from "./waiting";

const now = new Date("2026-10-03T14:00:00+02:00");
const rows = [
  {
    id: "r14",
    requisitionNo: "REQ-0014",
    requestedById: "tafara",
    amount: new Prisma.Decimal("1940.00"),
    approvalLimit: new Prisma.Decimal("500.00"),
    currency: "USD",
    purpose: "Cash to pay Afdis for order PO-0005",
    submittedAt: new Date("2026-10-03T11:20:00+02:00"),
    createdAt: new Date("2026-10-03T11:20:00+02:00"),
    payee: { name: "Afdis Distillers" },
    purchaseOrderId: "po5",
  },
  {
    id: "r15",
    requisitionNo: "REQ-0015",
    requestedById: "farai",
    amount: new Prisma.Decimal("62.00"),
    approvalLimit: new Prisma.Decimal("500.00"),
    currency: "USD",
    purpose: "Generator diesel, 40 litres",
    submittedAt: new Date("2026-10-03T11:45:00+02:00"),
    createdAt: new Date("2026-10-03T11:45:00+02:00"),
    payee: null,
    purchaseOrderId: null,
  },
];

const ctx = (role: string, userId: string) => ({ companyId: "co-1", userId, session: { user: { role } }, now });

describe("the requisitions provider", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue(rows);
  });

  it("words each one the owner may decide", async () => {
    expect(await requisitionsWaiting.list(ctx("SUPERADMIN", "owner"))).toEqual([
      { key: "req-r14", ref: "REQ-0014", text: ", US$1,940.00, for Afdis.", href: "/retail/buying/requisitions/r14", since: rows[0]!.submittedAt },
      { key: "req-r15", ref: "REQ-0015", text: ", US$62.00, for Generator diesel, 40 litres.", href: "/retail/buying/requisitions/r15", since: rows[1]!.submittedAt },
    ]);
  });

  it("leaves a manager what is over the limit", async () => {
    expect((await requisitionsWaiting.list(ctx("MANAGER", "tafara"))).map((entry) => entry.ref)).toEqual(["REQ-0015"]);
    expect(requisitionsWaiting.requires).toEqual(["retail.requisitions", "approve"]);
  });
});
