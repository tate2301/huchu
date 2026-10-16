import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

import { libraryFor, libraryItemFor } from "./reach";
import {
  createLibraryItem,
  deleteLibraryItem,
  duplicateLibraryItem,
  publishLibraryItem,
  retireLibraryItem,
  unpublishLibraryItem,
  updateLibraryItem,
} from "./store";

const run = randomUUID().slice(0, 8);
let owner: SignedInOperator;
let retail: { id: string };
let school: { id: string };

const question = (title: string) => ({
  kind: "EXPLORE" as const,
  title,
  payload: { answers: "Which quotes have waited a week", product: "crm", sql: "select 1" },
});

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `lib-${run}@corelith.test`, name: "Tafadzwa", role: "OWNER" } });
  owner = { sessionId: "o", id: op.id, email: op.email, name: op.name, role: op.role };
  retail = await prisma.company.create({ data: { name: `Shop ${run}`, slug: `shop-${run}`, verticals: { create: { vertical: "RETAIL" } } } });
  school = await prisma.company.create({ data: { name: `School ${run}`, slug: `school-${run}`, verticals: { create: { vertical: "SCHOOLS" } } } });
});

afterAll(async () => {
  const items = await prisma.libraryItem.findMany({ where: { createdById: owner.id }, select: { id: true } });
  await prisma.libraryItem.deleteMany({ where: { createdById: owner.id } });
  await prisma.platformAuditEvent.deleteMany({ where: { entityType: "library_item", entityId: { in: items.map((item) => item.id) } } });
  await prisma.company.deleteMany({ where: { id: { in: [retail.id, school.id] } } });
  await prisma.operator.deleteMany({ where: { id: owner.id } });
});

describe("the library", () => {
  it("keeps a new item as a draft, with an address from its title, refusing a payload its kind cannot read", async () => {
    const item = await createLibraryItem(owner, question(`Quotes waiting ${run}`));
    expect(item.status).toBe("DRAFT");
    expect(item.key).toBe(`quotes-waiting-${run}`);
    const again = await createLibraryItem(owner, question(`Quotes waiting ${run}`));
    expect(again.key).toBe(`quotes-waiting-${run}-2`);
    await expect(createLibraryItem(owner, { kind: "EXPLORE", title: "Broken one", payload: { sql: "" } })).rejects.toThrow(/not finished/);
    await expect(updateLibraryItem(owner, item.id, { key: "Not An Address" })).rejects.toThrow(/lowercase/);
  });

  it("reaches no workspace as a draft, every workspace when published to everyone", async () => {
    const item = await createLibraryItem(owner, question(`Everyone ${run}`));
    expect((await libraryFor(retail.id, "EXPLORE")).map((row) => row.id)).not.toContain(item.id);
    await publishLibraryItem(owner, item.id, { audience: "EVERYONE" });
    expect((await libraryFor(retail.id, "EXPLORE")).map((row) => row.id)).toContain(item.id);
    expect(await libraryItemFor(school.id, "EXPLORE", item.key)).not.toBeNull();
    expect((await libraryFor(retail.id, "REPORT")).map((row) => row.id)).not.toContain(item.id);
  });

  it("reaches only the verticals or the workspaces it is published to", async () => {
    const shops = await createLibraryItem(owner, question(`Shops only ${run}`));
    await publishLibraryItem(owner, shops.id, { audience: "VERTICALS", verticals: ["RETAIL"] });
    expect(await libraryItemFor(retail.id, "EXPLORE", shops.key)).not.toBeNull();
    expect(await libraryItemFor(school.id, "EXPLORE", shops.key)).toBeNull();

    const named = await createLibraryItem(owner, question(`Named ${run}`));
    await publishLibraryItem(owner, named.id, { audience: "WORKSPACES", companyIds: [school.id] });
    expect(await libraryItemFor(school.id, "EXPLORE", named.key)).not.toBeNull();
    expect(await libraryItemFor(retail.id, "EXPLORE", named.key)).toBeNull();

    // Publishing again to everyone forgets the names.
    await publishLibraryItem(owner, named.id, { audience: "EVERYONE" });
    expect(await prisma.libraryItemWorkspace.count({ where: { itemId: named.id } })).toBe(0);
    await expect(publishLibraryItem(owner, named.id, { audience: "VERTICALS", verticals: [] })).rejects.toThrow(/at least one vertical/);
  });

  it("leaves workspaces when retired or taken back to draft, and is deleted only when not published", async () => {
    const item = await createLibraryItem(owner, question(`Retiring ${run}`));
    await publishLibraryItem(owner, item.id, { audience: "EVERYONE" });
    await expect(deleteLibraryItem(owner, { ...item, status: "PUBLISHED" })).rejects.toThrow(/Retire it first/);
    await retireLibraryItem(owner, { id: item.id, status: "PUBLISHED" });
    expect(await libraryItemFor(retail.id, "EXPLORE", item.key)).toBeNull();
    await unpublishLibraryItem(owner, { id: item.id, status: "RETIRED" });
    const copy = await duplicateLibraryItem(owner, item.id);
    expect(copy.status).toBe("DRAFT");
    expect(copy.title).toBe(`Retiring ${run} (copy)`);
    await deleteLibraryItem(owner, { id: item.id, status: "DRAFT", title: item.title });
    expect(await prisma.libraryItem.findUnique({ where: { id: item.id } })).toBeNull();
  });
});
