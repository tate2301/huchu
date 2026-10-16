import type { LibraryKind } from "@prisma/client";
import type { z } from "zod";

import { buildProvisions, layoutProvisioned } from "@/lib/build/provision";
import { prisma } from "@/lib/prisma";

import {
  blockTemplatePayloadSchema,
  enquiryFormPayloadSchema,
  layoutPayloadSchema,
  visitFormPayloadSchema,
  type BlockTemplatePayload,
  type EnquiryFormPayload,
  type LayoutPayload,
  type VisitFormPayload,
} from "./build-kinds";
import { libraryFor, type ReachedItem } from "./reach";

/**
 * Corelith's published forms, templates and layouts, from a workspace's side:
 * the ones that reach it and that it runs the module for, each with its
 * payload read. Build lists them beside the ones in code; a workspace copies
 * one to make it its own. An item whose payload no longer reads is left out
 * rather than offered broken.
 */

export type LibraryEntry<P> = { id: string; key: string; title: string; summary: string | null; payload: P };

export type WorkspaceLibrary = {
  visitForms: LibraryEntry<VisitFormPayload>[];
  enquiryForms: LibraryEntry<EnquiryFormPayload>[];
  blockTemplates: LibraryEntry<BlockTemplatePayload>[];
  layouts: LibraryEntry<LayoutPayload>[];
};

export const NO_LIBRARY: WorkspaceLibrary = { visitForms: [], enquiryForms: [], blockTemplates: [], layouts: [] };

/** The kinds this file reads, and each one's payload. */
export const BUILD_LIBRARY_KINDS = {
  VISIT_FORM: visitFormPayloadSchema,
  ENQUIRY_FORM: enquiryFormPayloadSchema,
  BLOCK_TEMPLATE: blockTemplatePayloadSchema,
  LAYOUT: layoutPayloadSchema,
} as const;

export type BuildLibraryKind = keyof typeof BUILD_LIBRARY_KINDS;

export type BuildLibraryItem =
  | { kind: "VISIT_FORM"; entry: LibraryEntry<VisitFormPayload> }
  | { kind: "ENQUIRY_FORM"; entry: LibraryEntry<EnquiryFormPayload> }
  | { kind: "BLOCK_TEMPLATE"; entry: LibraryEntry<BlockTemplatePayload> }
  | { kind: "LAYOUT"; entry: LibraryEntry<LayoutPayload> };

function entryOf<S extends z.ZodTypeAny>(item: ReachedItem, schema: S): LibraryEntry<z.infer<S>> | null {
  const parsed = schema.safeParse(item.payload);
  return parsed.success ? { id: item.id, key: item.key, title: item.title, summary: item.summary, payload: parsed.data } : null;
}

function entries<S extends z.ZodTypeAny>(items: readonly ReachedItem[], schema: S): LibraryEntry<z.infer<S>>[] {
  return items.map((item) => entryOf(item, schema)).filter((entry): entry is LibraryEntry<z.infer<S>> => entry !== null);
}

export function isBuildLibraryKind(kind: LibraryKind): kind is BuildLibraryKind {
  return kind in BUILD_LIBRARY_KINDS;
}

/** What reaches this workspace, kept to what it is provisioned to build, as Build's own are. */
export async function readWorkspaceLibrary(companyId: string, enabledFeatures: readonly string[] | undefined): Promise<WorkspaceLibrary> {
  const provisions = buildProvisions(enabledFeatures);
  const [visits, enquiries, blocks, layouts] = await Promise.all([
    provisions.visitForms ? libraryFor(companyId, "VISIT_FORM") : [],
    provisions.enquiryForms ? libraryFor(companyId, "ENQUIRY_FORM") : [],
    provisions.blocks ? libraryFor(companyId, "BLOCK_TEMPLATE") : [],
    provisions.layouts ? libraryFor(companyId, "LAYOUT") : [],
  ]);
  return {
    visitForms: entries(visits, visitFormPayloadSchema),
    enquiryForms: entries(enquiries, enquiryFormPayloadSchema),
    blockTemplates: entries(blocks, blockTemplatePayloadSchema),
    layouts: entries(layouts, layoutPayloadSchema).filter((entry) => layoutProvisioned(entry.payload.sourceKey, enabledFeatures)),
  };
}

/** One of them by its address, if it reaches this workspace; null for anything else. */
export async function workspaceLibraryItem(companyId: string, key: string): Promise<BuildLibraryItem | null> {
  const found = await prisma.libraryItem.findUnique({ where: { key }, select: { kind: true } });
  if (!found || !isBuildLibraryKind(found.kind)) return null;
  return workspaceLibraryItemOf(companyId, found.kind, key);
}

/** One of a given kind by its address, if it reaches this workspace. */
export async function workspaceLibraryItemOf<K extends BuildLibraryKind>(
  companyId: string,
  kind: K,
  key: string,
): Promise<Extract<BuildLibraryItem, { kind: K }> | null> {
  const item = (await libraryFor(companyId, kind)).find((candidate) => candidate.key === key);
  const entry = item ? entryOf(item, BUILD_LIBRARY_KINDS[kind]) : null;
  return entry ? ({ kind, entry } as unknown as Extract<BuildLibraryItem, { kind: K }>) : null;
}

export type LayoutMatch = { sourceKey: string; documentType: LayoutPayload["documentType"]; targetType: LayoutPayload["targetType"] };

/**
 * The published layout a document prints with when the workspace has no
 * default of its own: the newest for exactly its source, or for any table
 * (`ui.table.*`) when it is a table.
 */
export async function libraryLayoutFor(companyId: string, match: LayoutMatch): Promise<LibraryEntry<LayoutPayload> | null> {
  const layouts = entries(await libraryFor(companyId, "LAYOUT"), layoutPayloadSchema).filter(
    (entry) => entry.payload.documentType === match.documentType && entry.payload.targetType === match.targetType,
  );
  return (
    layouts.find((entry) => entry.payload.sourceKey === match.sourceKey) ??
    (match.sourceKey.startsWith("ui.table.") ? layouts.find((entry) => entry.payload.sourceKey === "ui.table.*") : undefined) ??
    null
  );
}

/** A published layout by its id, if it reaches this workspace: one chosen for a document. */
export async function libraryLayoutById(companyId: string, id: string): Promise<LibraryEntry<LayoutPayload> | null> {
  return entries(await libraryFor(companyId, "LAYOUT"), layoutPayloadSchema).find((entry) => entry.id === id) ?? null;
}
