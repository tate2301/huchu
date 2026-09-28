/**
 * Saved views, through the real handlers and a real database.
 *
 * A view is one list's whole state — the search, every filter, the sort, the
 * layout, the grouping and the columns — so what is saved is what comes back,
 * and what cannot be a state of that list is refused on the way in. Sharing
 * with the team is its own permission, and only a view's author or a manager
 * may change it.
 *
 * Only the session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET, POST } = await import("./route");
const { PATCH, DELETE } = await import("./[id]/route");

const SLUG = "crm-saved-views-test";

let companyId: string;
const people: Record<"tendai" | "rudo" | "boss", string> = { tendai: "", rudo: "", boss: "" };

function as(who: keyof typeof people) {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: people[who], companyId, role: who === "boss" ? "MANAGER" : "SALES_REP" } },
  });
}

async function call(response: Promise<Response>) {
  const settled = await response;
  return { status: settled.status, body: await settled.json() };
}

const json = (method: string, url: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const create = (body: unknown) => call(POST(json("POST", "http://crm.test/api/v2/crm/saved-views", body)));
const list = (query = "") => call(GET(new NextRequest(`http://crm.test/api/v2/crm/saved-views${query}`)));
const update = (id: string, body: unknown) =>
  call(PATCH(json("PATCH", `http://crm.test/api/v2/crm/saved-views/${id}`, body), { params: Promise.resolve({ id }) }));
const remove = (id: string) =>
  call(
    DELETE(new NextRequest(`http://crm.test/api/v2/crm/saved-views/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    }),
  );

beforeAll(async () => {
  await prisma.crmSavedView.deleteMany({ where: { company: { slug: SLUG } } });
  await prisma.user.deleteMany({ where: { company: { slug: SLUG } } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await prisma.company.create({ data: { name: SLUG, slug: SLUG } })).id;
  for (const name of Object.keys(people) as Array<keyof typeof people>) {
    people[name] = (
      await prisma.user.create({
        data: {
          email: `${SLUG}-${name}@example.invalid`,
          name,
          companyId,
          role: name === "boss" ? "MANAGER" : "SALES_REP",
        },
      })
    ).id;
  }
});

beforeEach(async () => {
  await prisma.crmSavedView.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await prisma.crmSavedView.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

const EVERYTHING = {
  q: "borehole",
  filters: {
    stage: ["QUOTED", "SITE_VISIT"],
    owner: ["me", "none"],
    created: { preset: "this-month" },
    value: { min: 1000 },
    overdue: true,
    "cf.region": ["north"],
  },
  sort: { key: "value", dir: "desc" },
  layout: "TABLE",
  by: "owner",
  columns: ["name", "value", "stage", "owner"],
};

describe("saving a view", () => {
  it("keeps the search, every filter, the sort, the layout, the grouping and the columns", async () => {
    as("tendai");
    const { status, body } = await create({ register: "LEAD", name: "Big quotes", state: EVERYTHING });
    expect(status).toBe(201);
    expect(body).toMatchObject({ register: "LEAD", name: "Big quotes", isShared: false, canEdit: true });

    const stored = await prisma.crmSavedView.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.state).toEqual(EVERYTHING);
  });

  it("refuses a state the list cannot hold", async () => {
    as("tendai");
    const refused = [
      // Deals close; leads do not.
      { filters: { close: { preset: "this-month" } } },
      { filters: { stage: ["NOT_A_STAGE"] } },
      { filters: {}, columns: ["not_a_column"] },
      { filters: {}, sort: { key: "not_a_sort", dir: "asc" } },
      { filters: {}, layout: "CALENDAR" },
      // A page is a place in a scroll, not part of the question.
      { filters: {}, page: 2 },
    ];
    for (const state of refused) {
      const { status } = await create({ register: "LEAD", name: "Nope", state });
      expect(status, JSON.stringify(state)).toBe(400);
    }
    expect(await prisma.crmSavedView.count({ where: { companyId } })).toBe(0);
  });

  it("refuses a list that cannot save views yet", async () => {
    as("tendai");
    const { status, body } = await create({ register: "TASK", name: "Mine", state: { filters: {} } });
    expect(status).toBe(400);
    expect(body.error).toBe("This list cannot save views yet");
  });

  it("refuses a second view of one list under a name its author already uses", async () => {
    as("tendai");
    expect((await create({ register: "LEAD", name: "Big quotes", state: { filters: {} } })).status).toBe(201);
    const again = await create({ register: "LEAD", name: "big quotes ", state: { filters: {} } });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("There is already a view called");
    // Another list, or another person, may use it.
    expect((await create({ register: "DEAL", name: "Big quotes", state: { filters: {} } })).status).toBe(201);
    as("rudo");
    expect((await create({ register: "LEAD", name: "Big quotes", state: { filters: {} } })).status).toBe(201);

    as("tendai");
    const { body: other } = await create({ register: "LEAD", name: "Small quotes", state: { filters: {} } });
    expect((await update(other.id, { name: "Big Quotes" })).status).toBe(409);
    expect((await update(other.id, { name: "Small quotes" })).status).toBe(200);
  });

  it("shares with the team only for those allowed to", async () => {
    as("tendai");
    expect((await create({ register: "DEAL", name: "Team", state: { filters: {} }, isShared: true })).status).toBe(403);
    as("boss");
    expect((await create({ register: "DEAL", name: "Team", state: { filters: {} }, isShared: true })).status).toBe(201);
  });
});

describe("the views a reader sees", () => {
  it("are their own and the team's, of the list asked about", async () => {
    as("tendai");
    await create({ register: "LEAD", name: "Tendai's leads", state: { filters: {} } });
    await create({ register: "DEAL", name: "Tendai's deals", state: { filters: {} } });
    as("rudo");
    await create({ register: "LEAD", name: "Rudo's private", state: { filters: {} } });
    as("boss");
    await create({ register: "LEAD", name: "Everyone's", state: { filters: {} }, isShared: true });

    as("tendai");
    const leads = await list("?register=LEAD");
    expect(leads.status).toBe(200);
    expect(leads.body.canShare).toBe(false);
    expect(leads.body.data.map((view: { name: string; canEdit: boolean }) => [view.name, view.canEdit])).toEqual([
      ["Everyone's", false],
      ["Tendai's leads", true],
    ]);

    const everything = await list();
    expect(everything.body.data.map((view: { name: string }) => view.name)).toEqual([
      "Everyone's",
      "Tendai's deals",
      "Tendai's leads",
    ]);

    as("boss");
    const managed = await list("?register=LEAD");
    expect(managed.body.canShare).toBe(true);
    expect(managed.body.data.every((view: { canEdit: boolean }) => view.canEdit)).toBe(true);
  });
});

describe("changing a view", () => {
  it("is for its author or a manager", async () => {
    as("tendai");
    const { body: view } = await create({ register: "LEAD", name: "Mine", state: { filters: {} } });

    as("rudo");
    expect((await update(view.id, { name: "Taken" })).status).toBe(403);
    expect((await remove(view.id)).status).toBe(403);

    as("boss");
    expect((await update(view.id, { name: "Renamed" })).body.name).toBe("Renamed");
  });

  it("checks the new state against the list the view belongs to", async () => {
    as("tendai");
    const { body: view } = await create({ register: "LEAD", name: "Mine", state: { filters: {} } });

    expect((await update(view.id, { state: { filters: { close: { preset: "this-month" } } } })).status).toBe(400);

    const saved = await update(view.id, { state: { q: "roof", filters: { stage: ["NEW"] }, layout: "BOARD" } });
    expect(saved.status).toBe(200);
    expect(saved.body.state).toEqual({ q: "roof", filters: { stage: ["NEW"] }, layout: "BOARD" });
  });

  it("leaves a shared view alone for an author who may no longer share, except to withdraw it", async () => {
    as("boss");
    const { body: view } = await create({ register: "LEAD", name: "Team", state: { filters: {} }, isShared: true });
    await prisma.crmSavedView.update({ where: { id: view.id }, data: { createdById: people.tendai } });

    as("tendai");
    expect((await update(view.id, { name: "Mine now" })).status).toBe(403);
    const withdrawn = await update(view.id, { isShared: false });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.isShared).toBe(false);
  });

  it("deletes it for its author", async () => {
    as("tendai");
    const { body: view } = await create({ register: "LEAD", name: "Mine", state: { filters: {} } });
    expect((await remove(view.id)).status).toBe(200);
    expect((await remove(view.id)).status).toBe(404);
  });
});
