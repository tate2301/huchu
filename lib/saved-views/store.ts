import type { Prisma, PrismaClient } from "@prisma/client";

import {
  canChangeView,
  orderViews,
  viewPath,
  viewQuery,
  type SavedViewRecord,
} from "@/lib/saved-views/view";

/**
 * Saved views, as a workspace keeps them. Server-only. Every read and write is
 * scoped to the person's company; a view somebody else kept to themselves is
 * not there for anyone else, the same answer as one that does not exist.
 */

type Db = Pick<PrismaClient, "savedView">;
export type ViewPerson = { id: string; role: string | null | undefined; companyId: string };

type Row = { id: string; path: string; name: string; query: string; isShared: boolean; createdById: string };

const select = { id: true, path: true, name: true, query: true, isShared: true, createdById: true } as const;

function record(row: Row, person: ViewPerson): SavedViewRecord {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    query: row.query,
    isShared: row.isShared,
    mine: row.createdById === person.id,
    canChange: canChangeView(row, person),
  };
}

function visible(person: ViewPerson): Prisma.SavedViewWhereInput {
  return { companyId: person.companyId, OR: [{ createdById: person.id }, { isShared: true }] };
}

/** The views of one page: yours and the shared ones. */
export async function listSavedViews(db: Db, person: ViewPerson, rawPath: string): Promise<SavedViewRecord[]> {
  const path = viewPath(rawPath);
  if (!path) return [];
  const rows = await db.savedView.findMany({ where: { ...visible(person), path }, select, take: 100 });
  return orderViews(rows.map((row) => record(row, person)));
}

/** Keep the address being looked at under a name. */
export async function createSavedView(
  db: Db,
  person: ViewPerson,
  input: { name: string; href: string; isShared: boolean },
): Promise<{ ok: true; view: SavedViewRecord } | { ok: false; status: 400; message: string }> {
  const path = viewPath(input.href);
  if (!path) return { ok: false, status: 400, message: "That page cannot be saved as a view" };
  const query = viewQuery(input.href.includes("?") ? input.href.slice(input.href.indexOf("?") + 1).split("#")[0] : "");
  const row = await db.savedView.create({
    data: { companyId: person.companyId, path, name: input.name, query, isShared: input.isShared, createdById: person.id },
    select,
  });
  return { ok: true, view: record(row, person) };
}

type Refused = { ok: false; status: 403 | 404 };

async function changeable(db: Db, person: ViewPerson, id: string): Promise<Row | Refused> {
  const row = await db.savedView.findFirst({ where: { ...visible(person), id }, select });
  if (!row) return { ok: false, status: 404 };
  if (!canChangeView(row, person)) return { ok: false, status: 403 };
  return row;
}

export async function renameSavedView(
  db: Db,
  person: ViewPerson,
  id: string,
  name: string,
): Promise<{ ok: true; view: SavedViewRecord } | Refused> {
  const found = await changeable(db, person, id);
  if ("ok" in found) return found;
  const row = await db.savedView.update({ where: { id: found.id }, data: { name }, select });
  return { ok: true, view: record(row, person) };
}

export async function deleteSavedView(db: Db, person: ViewPerson, id: string): Promise<{ ok: true } | Refused> {
  const found = await changeable(db, person, id);
  if ("ok" in found) return found;
  await db.savedView.delete({ where: { id: found.id } });
  return { ok: true };
}
