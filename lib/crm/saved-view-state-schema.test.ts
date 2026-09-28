/**
 * Migration witness for 20260928090000_crm_saved_view_state.
 *
 * A saved view is now one list's whole state — the search, every filter, the
 * sort, the layout, the grouping and the columns — under the list it is a view
 * of. This pins what the migration exists to do:
 *
 *  - `register` and `state` are required, and the columns they replace are
 *    gone, along with the `CrmViewType` enum only they used;
 *  - `CrmRegister` names every list the engine knows, no more and no fewer;
 *  - a company's views of one list are found by an index;
 *  - every view saved before it keeps what it held — run here against views in
 *    the old shape, in a scratch schema that is rolled back — and comes out as
 *    a state the leads list accepts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { LEAD_REGISTER } from "@/lib/crm/registers/defs/lead";
import { viewStateSchema } from "@/lib/crm/registers/schema";
import { REGISTER_KEYS } from "@/lib/crm/registers/types";

const MIGRATION = path.join(
  process.cwd(),
  "prisma/migrations/20260928090000_crm_saved_view_state/migration.sql",
);

async function columns(table: string) {
  return prisma.$queryRaw<Array<{ column_name: string; is_nullable: string; udt_name: string }>>`
    SELECT column_name, is_nullable, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
}

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder
  `;
  return rows.map((row) => row.label);
}

describe("a saved view's columns", () => {
  it("are the list it belongs to and its state, both required", async () => {
    const byName = new Map((await columns("CrmSavedView")).map((column) => [column.column_name, column]));
    expect(byName.get("register")).toMatchObject({ is_nullable: "NO", udt_name: "CrmRegister" });
    expect(byName.get("state")).toMatchObject({ is_nullable: "NO", udt_name: "jsonb" });
  });

  it("no longer include the ones a state replaces", async () => {
    const names = (await columns("CrmSavedView")).map((column) => column.column_name);
    for (const gone of ["entity", "viewType", "filters", "sort", "columns", "groupBy"]) {
      expect(names).not.toContain(gone);
    }
    expect(await enumLabels("CrmViewType")).toEqual([]);
  });

  it("name every list the engine knows", async () => {
    expect(await enumLabels("CrmRegister")).toEqual([...REGISTER_KEYS]);
  });

  it("are found by company and list", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'CrmSavedView'
    `;
    expect(rows.some((row) => row.indexdef.includes('("companyId", register, "isShared")'))).toBe(true);
  });
});

/** A view as the old columns held it. */
type OldView = {
  entity?: string;
  viewType?: "TABLE" | "BOARD" | "CALENDAR";
  filters: Record<string, unknown>;
  sort?: Record<string, unknown> | null;
  columns?: unknown;
};

/**
 * The migration, run over views in the old shape: a scratch schema holding the
 * table as it was, the file executed with that schema first on the path, and
 * everything rolled back.
 */
async function fold(views: OldView[]): Promise<Array<{ register: string; state: Record<string, unknown> }>> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = `saved_view_fold_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TYPE "CrmViewType" AS ENUM ('TABLE', 'BOARD', 'CALENDAR');
      CREATE TABLE "CrmSavedView" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "entity" TEXT NOT NULL DEFAULT 'LEAD',
        "name" TEXT NOT NULL,
        "viewType" "CrmViewType" NOT NULL DEFAULT 'TABLE',
        "filters" JSONB NOT NULL,
        "sort" JSONB,
        "columns" JSONB,
        "groupBy" TEXT,
        "isShared" BOOLEAN NOT NULL DEFAULT false,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      );
      CREATE INDEX "CrmSavedView_companyId_entity_isShared_idx"
        ON "CrmSavedView"("companyId", "entity", "isShared");
    `);
    for (const [index, view] of views.entries()) {
      await client.query(
        `INSERT INTO "CrmSavedView"
           ("id", "companyId", "entity", "name", "viewType", "filters", "sort", "columns", "createdById", "updatedAt")
         VALUES ($1, 'company', $2, $3, $4, $5, $6, $7, 'author', now())`,
        [
          String(index).padStart(4, "0"),
          view.entity ?? "LEAD",
          `View ${index}`,
          view.viewType ?? "TABLE",
          JSON.stringify(view.filters),
          view.sort === undefined || view.sort === null ? null : JSON.stringify(view.sort),
          view.columns === undefined ? null : JSON.stringify(view.columns),
        ],
      );
    }

    await client.query(readFileSync(MIGRATION, "utf8"));

    const { rows } = await client.query<{ register: string; state: Record<string, unknown> }>(
      `SELECT "register"::text AS register, "state" FROM "CrmSavedView" ORDER BY "id"`,
    );
    return rows;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

const OWNER = "7b0c4c1e-4a57-4a8e-9f55-2d3f7c1a9b10";

describe("views saved before the migration", () => {
  it("keep every filter, the search, the sort, the layout and the columns", async () => {
    const [folded] = await fold([
      {
        viewType: "BOARD",
        filters: {
          q: "  borehole ",
          stages: ["QUOTED", "NEW"],
          assignedToIds: [OWNER],
          unassigned: true,
          channels: ["WEB_FORM"],
          sources: ["Facebook"],
          valueMin: 1000,
          valueMax: 25000,
          // Midnight on 1 September and the last moment of 30 September, in Harare.
          createdFrom: "2026-08-31T22:00:00.000Z",
          createdTo: "2026-09-30T21:59:59.999Z",
          overdueOnly: true,
          archived: false,
        },
        sort: { field: "estimatedValue", direction: "desc" },
        columns: ["leadNo", "client", "nextTask", "stage", "client", "updatedAt"],
      },
    ]);

    expect(folded.register).toBe("LEAD");
    expect(folded.state).toEqual({
      q: "borehole",
      filters: {
        stage: ["NEW", "QUOTED"],
        owner: [OWNER, "none"],
        channel: ["WEB_FORM"],
        source: ["Facebook"],
        value: { min: 1000, max: 25000 },
        created: { from: "2026-09-01", to: "2026-09-30" },
        overdue: true,
      },
      sort: { key: "value", dir: "desc" },
      layout: "BOARD",
      columns: ["name", "company", "next", "stage", "updated"],
    });
    expect(viewStateSchema(LEAD_REGISTER).safeParse(folded.state).success).toBe(true);
  });

  it("read the days a reader west of UTC picked as those days too", async () => {
    const [folded] = await fold([
      {
        filters: {
          // Midnight on 1 September and the last moment of 30 September, in New York.
          createdFrom: "2026-09-01T04:00:00.000Z",
          createdTo: "2026-10-01T03:59:59.999Z",
        },
      },
    ]);
    expect(folded.state.filters).toEqual({ created: { from: "2026-09-01", to: "2026-09-30" } });
  });

  it("make 'mine only' the reader's own leads, whoever else was ticked", async () => {
    const [folded] = await fold([{ filters: { mineOnly: true, assignedToIds: [OWNER] } }]);
    expect(folded.state.filters).toEqual({ owner: ["me"] });
  });

  it("leave out what the leads list has no answer for", async () => {
    const [folded] = await fold([
      {
        viewType: "CALENDAR",
        filters: {
          q: "   ",
          stages: ["NOPE"],
          channels: "WEB_FORM",
          valueMin: "lots",
          createdFrom: "last tuesday",
          overdueOnly: "yes",
        },
        sort: { field: "colour", direction: "sideways" },
        columns: ["bogus"],
      },
    ]);
    expect(folded.state).toEqual({ filters: {}, layout: "TABLE" });
    expect(viewStateSchema(LEAD_REGISTER).safeParse(folded.state).success).toBe(true);
  });

  it("open on the leads list whatever record type they named, as they always did", async () => {
    const [folded] = await fold([{ entity: "DEAL", filters: { stages: ["WON"] } }]);
    expect(folded).toEqual({ register: "LEAD", state: { filters: { stage: ["WON"] }, layout: "TABLE" } });
  });
});
