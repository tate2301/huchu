import { Prisma, type LibraryAudience, type LibraryItem, type LibraryKind, type Vertical } from "@prisma/client";

import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

import { LIBRARY_KINDS } from "./kinds";

/**
 * Corelith's library, from the portal's side: make an item, change it,
 * publish it to everyone, to verticals or to named workspaces, retire it,
 * bring it back. Each change is on the operators' audit log.
 *
 * A published item is read live by workspaces (`./reach.ts`); changing it
 * changes what they see next. A workspace that copied it keeps its copy.
 */

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugOf(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** The payload as its kind's builder has it, or a refusal naming what is wrong. */
export function checkPayload(kind: LibraryKind, payload: unknown): Prisma.InputJsonValue {
  const parsed = LIBRARY_KINDS[kind].payload.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    throw new AdminRefusal(`This ${LIBRARY_KINDS[kind].label.toLowerCase()} is not finished: ${issue?.message ?? "it does not read"}${where}.`);
  }
  return parsed.data as Prisma.InputJsonValue;
}

async function freeKey(wanted: string, except?: string) {
  let key = wanted || "item";
  for (let n = 2; ; n += 1) {
    const taken = await prisma.libraryItem.findUnique({ where: { key }, select: { id: true } });
    if (!taken || taken.id === except) return key;
    key = `${wanted}-${n}`;
  }
}

export type LibraryDraft = { kind: LibraryKind; title: string; summary?: string | null; payload: unknown; key?: string };

export async function createLibraryItem(operator: SignedInOperator, draft: LibraryDraft) {
  const title = draft.title.trim();
  if (title.length < 2 || title.length > 120) throw new AdminRefusal("A title is 2 to 120 characters.");
  if (draft.key && !KEY_PATTERN.test(draft.key)) throw new AdminRefusal("An address is lowercase words joined by dashes.");
  const payload = checkPayload(draft.kind, draft.payload);
  const key = await freeKey(draft.key ?? slugOf(title));
  const item = await prisma.libraryItem.create({
    data: { kind: draft.kind, key, title, summary: draft.summary?.trim() || null, payload, createdById: operator.id },
  });
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: "operator.library.created",
    entityType: "library_item",
    entityId: item.id,
    payload: { kind: item.kind, key: item.key, title: item.title },
  });
  return item;
}

export async function updateLibraryItem(
  operator: SignedInOperator,
  id: string,
  change: { title?: string; summary?: string | null; payload?: unknown; key?: string },
) {
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item) throw new AdminRefusal("That library item no longer exists.");
  const data: Prisma.LibraryItemUpdateInput = {};
  if (change.title !== undefined) {
    const title = change.title.trim();
    if (title.length < 2 || title.length > 120) throw new AdminRefusal("A title is 2 to 120 characters.");
    data.title = title;
  }
  if (change.summary !== undefined) data.summary = change.summary?.trim() || null;
  if (change.payload !== undefined) data.payload = checkPayload(item.kind, change.payload);
  if (change.key !== undefined && change.key !== item.key) {
    if (!KEY_PATTERN.test(change.key)) throw new AdminRefusal("An address is lowercase words joined by dashes.");
    if ((await freeKey(change.key, item.id)) !== change.key) throw new AdminRefusal(`The address ${change.key} is taken.`);
    data.key = change.key;
  }
  const updated = await prisma.libraryItem.update({ where: { id }, data });
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: "operator.library.changed",
    entityType: "library_item",
    entityId: id,
    payload: { kind: item.kind, key: updated.key, fields: Object.keys(data) },
  });
  return updated;
}

export type LibraryReach =
  | { audience: "EVERYONE" }
  | { audience: "VERTICALS"; verticals: Vertical[] }
  | { audience: "WORKSPACES"; companyIds: string[] };

/** Published to whom it is set for, now. Publishing again changes the audience; the item is read live. */
export async function publishLibraryItem(operator: SignedInOperator, id: string, reach: LibraryReach) {
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item) throw new AdminRefusal("That library item no longer exists.");
  checkPayload(item.kind, item.payload);
  if (reach.audience === "VERTICALS" && reach.verticals.length === 0) throw new AdminRefusal("Choose at least one vertical.");
  if (reach.audience === "WORKSPACES" && reach.companyIds.length === 0) throw new AdminRefusal("Choose at least one workspace.");
  await prisma.$transaction(async (tx) => {
    await tx.libraryItemWorkspace.deleteMany({ where: { itemId: id } });
    if (reach.audience === "WORKSPACES") {
      await tx.libraryItemWorkspace.createMany({ data: [...new Set(reach.companyIds)].map((companyId) => ({ itemId: id, companyId })) });
    }
    await tx.libraryItem.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        audience: reach.audience as LibraryAudience,
        verticals: reach.audience === "VERTICALS" ? [...new Set(reach.verticals)] : [],
        publishedAt: item.status === "PUBLISHED" && item.publishedAt ? item.publishedAt : new Date(),
      },
    });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        eventType: "operator.library.published",
        entityType: "library_item",
        entityId: id,
        payload: { kind: item.kind, key: item.key, ...reach },
      },
      tx,
    );
  });
}

/** Out of every workspace's library; copies workspaces made stay theirs. */
export async function retireLibraryItem(operator: SignedInOperator, item: Pick<LibraryItem, "id" | "status">) {
  if (item.status === "RETIRED") throw new AdminRefusal("It is already retired.");
  await prisma.libraryItem.update({ where: { id: item.id }, data: { status: "RETIRED" } });
  await recordOperatorEvent({ operatorId: operator.id, eventType: "operator.library.retired", entityType: "library_item", entityId: item.id });
}

/** Back to a draft: nobody sees it until it is published again. */
export async function unpublishLibraryItem(operator: SignedInOperator, item: Pick<LibraryItem, "id" | "status">) {
  if (item.status === "DRAFT") throw new AdminRefusal("It is already a draft.");
  await prisma.libraryItem.update({ where: { id: item.id }, data: { status: "DRAFT" } });
  await recordOperatorEvent({ operatorId: operator.id, eventType: "operator.library.unpublished", entityType: "library_item", entityId: item.id });
}

/** A draft copy to work on, with its own address. */
export async function duplicateLibraryItem(operator: SignedInOperator, id: string) {
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item) throw new AdminRefusal("That library item no longer exists.");
  return createLibraryItem(operator, { kind: item.kind, title: `${item.title} (copy)`.slice(0, 120), summary: item.summary, payload: item.payload });
}

/** Only an item never published, or retired, can go: a published one is in workspaces' hands. */
export async function deleteLibraryItem(operator: SignedInOperator, item: Pick<LibraryItem, "id" | "status" | "title">) {
  if (item.status === "PUBLISHED") throw new AdminRefusal(`${item.title} is published. Retire it first.`);
  await prisma.libraryItem.delete({ where: { id: item.id } });
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: "operator.library.deleted",
    entityType: "library_item",
    entityId: item.id,
    payload: { title: item.title },
  });
}
