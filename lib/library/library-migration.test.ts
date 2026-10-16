/**
 * Migration witness for `library`.
 *
 * Corelith's library is one row per item: its kind, its address, its payload,
 * whether it is published and to whom; and one row per workspace an item is
 * published to by name, gone with the item or the workspace.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function columns(table: string) {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES" }]));
}

async function enumLabels(name: string) {
  const [{ labels }] = await prisma.$queryRaw<Array<{ labels: string[] | null }>>`
    SELECT array_agg(enumlabel ORDER BY enumsortorder)::text[] AS labels
    FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = ${name}`;
  return labels;
}

async function deleteRule(constraint: string) {
  const [row] = await prisma.$queryRaw<Array<{ rule: string }>>`
    SELECT delete_rule AS rule FROM information_schema.referential_constraints WHERE constraint_name = ${constraint}`;
  return row?.rule ?? null;
}

describe("the library", () => {
  it("is one row per item, with its kind, address, payload, standing and audience", async () => {
    const cols = await columns("LibraryItem");
    expect(cols.kind).toEqual({ type: "LibraryKind", nullable: false });
    expect(cols.key).toEqual({ type: "text", nullable: false });
    expect(cols.payload).toEqual({ type: "jsonb", nullable: false });
    expect(cols.status).toEqual({ type: "LibraryStatus", nullable: false });
    expect(cols.audience).toEqual({ type: "LibraryAudience", nullable: false });
    expect(cols.verticals).toEqual({ type: "_Vertical", nullable: true });
    expect(cols.createdById).toEqual({ type: "text", nullable: false });
    expect(await enumLabels("LibraryKind")).toEqual(["REPORT", "EXPLORE", "INSIGHT", "VISIT_FORM", "ENQUIRY_FORM", "BLOCK_TEMPLATE", "LAYOUT"]);
    expect(await enumLabels("LibraryStatus")).toEqual(["DRAFT", "PUBLISHED", "RETIRED"]);
    expect(await enumLabels("LibraryAudience")).toEqual(["EVERYONE", "VERTICALS", "WORKSPACES"]);
  });

  it("names each workspace an item reaches, gone with the item or the workspace", async () => {
    const cols = await columns("LibraryItemWorkspace");
    expect(cols.itemId).toEqual({ type: "text", nullable: false });
    expect(cols.companyId).toEqual({ type: "text", nullable: false });
    expect(await deleteRule("LibraryItemWorkspace_itemId_fkey")).toBe("CASCADE");
    expect(await deleteRule("LibraryItemWorkspace_companyId_fkey")).toBe("CASCADE");
    expect(await deleteRule("LibraryItem_createdById_fkey")).toBe("RESTRICT");
  });
});
