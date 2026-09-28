/**
 * The groups a reader can see, asked from a record's page: each says whether
 * it holds that record, which is what the record's "Groups" control ticks.
 * Other companies' groups, and private groups of somebody else's, are never
 * in the answer.
 *
 * The session is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET } = await import("./route");

const SLUG = "crm-groups-holding-test";
const OTHER = "crm-groups-holding-test-other";

let companyId: string;
let tendai: string;
let rudo: string;
const ids: Record<string, string> = {};

async function groups(query: string) {
  validateSessionMock.mockResolvedValue({ session: { user: { id: tendai, companyId, role: "SALES_REP" } } });
  const response = await GET(new NextRequest(`http://crm.test/api/v2/crm/lists${query}`));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: Array<{ name: string; contains?: boolean; canEdit: boolean }> };
  return body.data;
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const [company, other] = await Promise.all(
    [SLUG, OTHER].map((slug) => prisma.company.create({ data: { name: slug, slug } })),
  );
  companyId = company.id;
  [tendai, rudo] = await Promise.all(
    ["tendai", "rudo"].map(async (name) =>
      (
        await prisma.user.upsert({
          where: { email: `${SLUG}-${name}@example.invalid` },
          update: { companyId },
          create: { email: `${SLUG}-${name}@example.invalid`, name, companyId, role: "SALES_REP" },
        })
      ).id,
    ),
  );
  ids.anesu = (await prisma.crmPerson.create({ data: { companyId, personNo: "P-1", firstName: "Anesu", fullName: "Anesu" } })).id;

  const group = (data: { name: string; isShared: boolean; createdById: string; holds: boolean; companyId?: string }) =>
    prisma.crmList.create({
      data: {
        companyId: data.companyId ?? companyId,
        entity: "PERSON",
        name: data.name,
        isShared: data.isShared,
        createdById: data.createdById,
        ...(data.holds ? { members: { create: [{ companyId, recordId: ids.anesu }] } } : {}),
      },
    });
  await group({ name: "Mine, holding", isShared: false, createdById: tendai, holds: true });
  await group({ name: "Mine, empty", isShared: false, createdById: tendai, holds: false });
  await group({ name: "Rudo's shared", isShared: true, createdById: rudo, holds: true });
  await group({ name: "Rudo's private", isShared: false, createdById: rudo, holds: true });
  await group({ name: "Elsewhere", isShared: true, createdById: rudo, holds: false, companyId: other.id });
});

afterAll(async () => {
  await prisma.crmList.deleteMany({ where: { company: { slug: { in: [SLUG, OTHER] } } } });
  await prisma.crmPerson.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
});

describe("the groups a record is in", () => {
  it("says which of the reader's groups hold the record, and which they may change", async () => {
    const data = await groups(`?entity=PERSON&recordId=${ids.anesu}`);
    expect(
      data.map((group) => [group.name, group.contains, group.canEdit]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["Mine, empty", false, true],
      ["Mine, holding", true, true],
      ["Rudo's shared", true, false],
    ]);
  });

  it("does not answer a question nobody asked", async () => {
    const data = await groups("?entity=PERSON");
    expect(data.every((group) => group.contains === undefined)).toBe(true);
  });

  it("ignores a record id that is not one", async () => {
    const data = await groups("?entity=PERSON&recordId=not-an-id");
    expect(data.every((group) => group.contains === undefined)).toBe(true);
  });
});
