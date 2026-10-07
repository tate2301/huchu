import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { createJournalEntryFromSource, type PostingContext } from "@/lib/accounting/posting";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";

/**
 * "Post now" (SET-09, W-65) through its route, against the test database with
 * only the sign-in faked: a manager is refused, a bad run id is refused, two
 * presses at once share one run, and a slice says what could not post.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST } from "./route";

let companyId = "";
let ownerId = "";
let countNo = 0;

const signedInAs = (role: string) =>
  validateSessionMock.mockResolvedValue({
    session: { user: { id: ownerId, companyId, role, name: "Tendai Mhlanga", email: "owner@posting.test", enabledFeatures: ["retail.core"] } },
  });

const press = async (body: unknown = {}) => {
  const response = await POST(
    new NextRequest("http://shop.test/api/v2/retail/posting/run", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: response.status, body: await response.json() };
};

/** A count that found 7.10 of stock missing, left for the day's run. */
const lossCount = (): PostingContext => {
  countNo += 1;
  return {
    companyId,
    sourceType: "RETAIL_STOCK_ADJUSTMENT",
    sourceId: `route-count-${countNo}-${Date.now()}`,
    sourceSubtype: "COUNT_LOSS",
    entryDate: new Date(),
    description: `Retail stock adjustment ADJ-${countNo}`,
    createdById: ownerId,
    amount: 7.1,
    netAmount: 7.1,
    taxAmount: 0,
    grossAmount: 7.1,
    invertDirection: true,
    inventory: { lines: [{ itemName: "Castle Lager 340ml", quantity: 1, unitCost: 7.1, totalCost: 7.1 }], totalCost: 7.1 },
  };
};

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  companyId = (await prisma.company.create({ data: { name: `Post now ${stamp}`, slug: `post-now-${stamp}` }, select: { id: true } })).id;
  ownerId = (
    await prisma.user.create({
      data: { email: `owner-${stamp}@posting.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId },
      select: { id: true },
    })
  ).id;
  await runAccountingSeedPack({ companyId, mode: "APPLY" });
}, 60_000);

afterAll(async () => {
  if (!companyId) return;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("Post now", () => {
  it("refuses a manager and a run id that is not one", async () => {
    signedInAs("MANAGER");
    const manager = await press();
    expect(manager.status).toBe(403);
    expect(manager.body.error).toBe("Your role cannot change posting to the books");

    signedInAs("SUPERADMIN");
    expect(await press({ runId: "nope" })).toMatchObject({ status: 400, body: { error: "Nothing was posted. Try again." } });
    expect(await prisma.retailPostingRun.count({ where: { companyId } })).toBe(0);
  });

  it("posts what waits in one run however many press it, and says what could not post", async () => {
    signedInAs("SUPERADMIN");
    const counts = [lossCount(), lossCount(), lossCount()];
    for (const context of counts) expect(await createJournalEntryFromSource(context)).toMatchObject({ deferred: true });
    // One that could not post before: tried again, and posts this time.
    await prisma.accountingIntegrationEvent.updateMany({
      where: { companyId, sourceId: counts[0]!.sourceId },
      data: { status: "FAILED", lastError: "Unique constraint failed on the fields: (`companyId`,`entryNumber`)" },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const [owner, bookkeeper] = await Promise.all([press(), press()]);
    expect(bookkeeper.body.runId).toBe(owner.body.runId);

    let slice = owner.body;
    while (!slice.done) {
      if (slice.busy) await new Promise((resolve) => setTimeout(resolve, 100));
      slice = (await press({ runId: owner.body.runId })).body;
    }
    expect(slice).toMatchObject({ done: true, busy: false, posted: 3, failed: 0, waiting: 0, run: { toast: "Posted 3 counts." } });
    expect(await prisma.retailPostingRun.count({ where: { companyId } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId, sourceId: { in: counts.map((context) => context.sourceId!) } } })).toBe(3);
  }, 30_000);
});
