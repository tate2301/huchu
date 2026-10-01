/**
 * A form's name is unique within a company, and asking for one that is taken
 * — by creating a form or by renaming one — is answered with a 409 the editor
 * can show, not a 500. Every new form used to be called "New intake form", so
 * the second one a company made failed with "Failed to create intake form".
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

const { POST } = await import("./route");
const { PATCH } = await import("./[id]/route");

const SLUG = "crm-intake-form-names-test";

let companyId: string;

function create(name: string) {
  return POST(
    new NextRequest("http://crm.test/api/v2/crm/intake-forms", {
      method: "POST",
      body: JSON.stringify({ name, fields: [], services: [] }),
    }),
  );
}

function rename(id: string, name: string) {
  return PATCH(
    new NextRequest(`http://crm.test/api/v2/crm/intake-forms/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await prisma.company.create({ data: { name: SLUG, slug: SLUG } })).id;
  const manager = await prisma.user.upsert({
    where: { email: `${SLUG}-manager@example.invalid` },
    update: { companyId },
    create: { email: `${SLUG}-manager@example.invalid`, name: "Manager", companyId, role: "MANAGER" },
  });
  validateSessionMock.mockResolvedValue({
    session: { user: { id: manager.id, companyId, role: "MANAGER" } },
  });
});

afterAll(async () => {
  await prisma.crmIntakeForm.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("intake form names", () => {
  it("refuses a second form with a name already taken", async () => {
    expect((await create("Website enquiries")).status).toBe(201);

    const taken = await create("Website enquiries");
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ error: "There is already a form with that name" });

    expect((await create("Site visit requests")).status).toBe(201);
  });

  it("refuses a rename onto a name already taken", async () => {
    const form = await prisma.crmIntakeForm.findFirstOrThrow({
      where: { companyId, name: "Site visit requests" },
    });

    expect((await rename(form.id, "Website enquiries")).status).toBe(409);
    expect((await rename(form.id, "Quotes")).status).toBe(200);
  });
});
