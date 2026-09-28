/**
 * Adding records to a group, through the real handler and a real database:
 * only records of the group's own type, in this company, go in; the answer
 * says how many were added, already there, or refused.
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

const { PATCH } = await import("./route");

const SLUG = "crm-group-members-test";
const OTHER = "crm-group-members-test-other";

let companyId: string;
let tendai: string;
let groupId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const [company, other] = await Promise.all(
    [SLUG, OTHER].map((slug) => prisma.company.create({ data: { name: slug, slug } })),
  );
  companyId = company.id;
  tendai = (
    await prisma.user.upsert({
      where: { email: `${SLUG}-tendai@example.invalid` },
      update: { companyId },
      create: { email: `${SLUG}-tendai@example.invalid`, name: "Tendai", companyId, role: "SALES_REP" },
    })
  ).id;
  ids.anesu = (await prisma.crmPerson.create({ data: { companyId, personNo: "P-1", firstName: "Anesu", fullName: "Anesu" } })).id;
  ids.blessing = (await prisma.crmPerson.create({ data: { companyId, personNo: "P-2", firstName: "Blessing", fullName: "Blessing" } })).id;
  ids.acme = (await prisma.crmClient.create({ data: { companyId, clientNo: "C-1", name: "Acme" } })).id;
  ids.stranger = (
    await prisma.crmPerson.create({ data: { companyId: other.id, personNo: "P-1", firstName: "S", fullName: "Stranger" } })
  ).id;
  groupId = (
    await prisma.crmList.create({
      data: {
        companyId,
        entity: "PERSON",
        name: "Campaign",
        createdById: tendai,
        members: { create: [{ companyId, recordId: ids.anesu }] },
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.crmList.deleteMany({ where: { companyId } });
  await prisma.crmClient.deleteMany({ where: { companyId } });
  await prisma.crmPerson.deleteMany({ where: { company: { slug: { in: [SLUG, OTHER] } } } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
});

describe("adding to a group", () => {
  it("adds only this company's records of the group's type, and says what happened to the rest", async () => {
    validateSessionMock.mockResolvedValue({ session: { user: { id: tendai, companyId, role: "SALES_REP" } } });
    const response = await PATCH(
      new NextRequest(`http://crm.test/api/v2/crm/lists/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({ addRecordIds: [ids.anesu, ids.blessing, ids.acme, ids.stranger] }),
      }),
      { params: Promise.resolve({ id: groupId }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ added: 1, alreadyIn: 1, notFound: 2 });
    const members = await prisma.crmListMember.findMany({ where: { listId: groupId }, select: { recordId: true } });
    expect(members.map((member) => member.recordId).sort()).toEqual([ids.anesu, ids.blessing].sort());
  });
});
