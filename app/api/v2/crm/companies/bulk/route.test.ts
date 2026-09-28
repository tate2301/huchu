/**
 * Acting on many companies at once, through the real handler and a real
 * database: it does what the reader may, counts what it left alone and why,
 * and never writes a record that is already how it was asked to be.
 *
 * The session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { POST } = await import("./route");
const { POST: SITES_POST } = await import("../../sites/bulk/route");

const SLUG = "crm-companies-bulk-test";
const OTHER = "crm-companies-bulk-test-other";

let companyId: string;
let tendai: string;
let rudo: string;
let mine: string;
let rudos: string;
let nobodys: string;
let stranger: string;

async function bulk(body: Record<string, unknown>, as = tendai, role = "SALES_REP", handler = POST) {
  validateSessionMock.mockResolvedValue({ session: { user: { id: as, companyId, role } } });
  const response = await handler(
    new NextRequest("http://crm.test/api/v2/crm/companies/bulk", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const [company, other] = await Promise.all(
    [SLUG, OTHER].map((slug) => prisma.company.create({ data: { name: slug, slug } })),
  );
  companyId = company.id;
  const users = await Promise.all(
    ["tendai", "rudo"].map((name) =>
      prisma.user.upsert({
        where: { email: `${SLUG}-${name}@example.invalid` },
        update: { companyId, role: "SALES_REP" },
        create: { email: `${SLUG}-${name}@example.invalid`, name, companyId, role: "SALES_REP" },
      }),
    ),
  );
  [tendai, rudo] = users.map((user) => user.id);
  stranger = (await prisma.crmClient.create({ data: { companyId: other.id, clientNo: "C-9", name: "Stranger" } })).id;
});

beforeEach(async () => {
  await prisma.crmClient.deleteMany({ where: { companyId } });
  mine = (await prisma.crmClient.create({ data: { companyId, clientNo: "C-1", name: "Mine", assignedToId: tendai } })).id;
  rudos = (await prisma.crmClient.create({ data: { companyId, clientNo: "C-2", name: "Rudo's", assignedToId: rudo } })).id;
  nobodys = (await prisma.crmClient.create({ data: { companyId, clientNo: "C-3", name: "Nobody's" } })).id;
});

afterAll(async () => {
  await prisma.crmClient.deleteMany({ where: { company: { slug: { in: [SLUG, OTHER] } } } });
  await prisma.crmSite.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
});

describe("bulk actions on companies", () => {
  it("does what a rep may, and says what it skipped and why", async () => {
    const { status, body } = await bulk({ action: "status", ids: [mine, rudos, nobodys, stranger], value: "ON_HOLD" });
    expect(status).toBe(200);
    expect(body).toEqual({
      updated: 2,
      unchanged: 0,
      skipped: 1,
      notFound: 1,
      skippedReason: "they belong to someone else",
    });
    const held = await prisma.crmClient.findMany({ where: { companyId, accountStatus: "ON_HOLD" }, select: { id: true } });
    expect(held.map((row) => row.id).sort()).toEqual([mine, nobodys].sort());
  });

  it("reads me as the person asking and counts the ones already theirs", async () => {
    const { body } = await bulk({ action: "assign", ids: [mine, nobodys], value: "me" });
    expect(body).toMatchObject({ updated: 1, unchanged: 1, skipped: 0 });
    const claimed = await prisma.crmClient.findUnique({ where: { id: nobodys }, select: { assignedToId: true } });
    expect(claimed?.assignedToId).toBe(tendai);
  });

  it("lets a manager act on anybody's", async () => {
    const { body } = await bulk({ action: "archive", ids: [mine, rudos] }, rudo, "MANAGER");
    expect(body).toMatchObject({ updated: 2, skipped: 0 });
    const restored = await bulk({ action: "restore", ids: [mine, rudos, nobodys] }, rudo, "MANAGER");
    expect(restored.body).toMatchObject({ updated: 2, unchanged: 1 });
  });

  it("refuses when nothing selected may be touched", async () => {
    const { status } = await bulk({ action: "archive", ids: [rudos] });
    expect(status).toBe(403);
  });

  it("refuses an owner who is not on the team, and a status that does not exist", async () => {
    expect((await bulk({ action: "assign", ids: [mine], value: stranger })).status).toBe(400);
    expect((await bulk({ action: "status", ids: [mine], value: "GONE" })).status).toBe(400);
  });

  it("refuses an action the records do not take", async () => {
    const site = await prisma.crmSite.create({ data: { companyId, siteNo: "S-1", name: "Yard" } });
    const { status } = await bulk({ action: "assign", ids: [site.id], value: "me" }, tendai, "SALES_REP", SITES_POST);
    expect(status).toBe(400);
  });
});
