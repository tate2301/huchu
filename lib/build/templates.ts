import { BUILDER_TEMPLATES } from "@/lib/crm/site-visits/builder-templates";
import { STARTER_TEMPLATES } from "@/lib/crm/starter-templates";
import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";
import { DISPLAY_FIELD_TYPES, type FieldType } from "@/lib/forms/fields";
import type { BuildLibraryKind, WorkspaceLibrary } from "@/lib/library/workspace";

import { buildHref, type BuildItem } from "./items";
import { layoutProvisioned, layoutUser, type BuildProvisions, type BuildUser } from "./provision";

/**
 * Build's templates (PageBuildTemplates): the starting points Corelith ships,
 * the workspace's own, and the ones it has retired. A template is a starting
 * point: using one makes the workspace's own copy, which opens in the builder.
 */

export type TemplateGroup = "forms" | "documents" | "emails";
export type TemplateView = "corelith" | "made" | "retired";

export const TEMPLATE_GROUP: Record<TemplateGroup, { title: string; note: string }> = {
  forms: { title: "Forms", note: "Intake and site forms" },
  documents: { title: "Documents", note: "Printed and sent as PDF, with your branding" },
  emails: { title: "Emails and messages", note: "Sent by email or WhatsApp" },
};

export const TEMPLATE_VIEW_LABEL: Record<TemplateView, string> = {
  corelith: "From Corelith",
  made: "Made here",
  retired: "Retired",
};

/** How using a template makes the workspace's copy. */
export type TemplateStart =
  | { type: "visit"; template: string }
  | { type: "enquiry" }
  | { type: "block"; starter: string; kind: string; name: string }
  | { type: "layout"; sourceKey: string; documentType: string; targetType: string; name: string }
  /** One of Corelith's library, by its address: the type's own API copies it. */
  | { type: "library"; kind: BuildLibraryKind; key: string; name: string };

export type BuildTemplate = {
  key: string;
  name: string;
  /** What it does, in one line. */
  description: string;
  group: TemplateGroup;
  usedBy: BuildUser;
  /** "Built in" for Corelith's; "Default" for the workspace's default. */
  badge: string | null;
  /** Corelith's: how a copy is made. The workspace's own: where it opens. */
  start: TemplateStart | null;
  href: string | null;
};

const blockGroup = (kind: string): TemplateGroup => (kind === "FORM" ? "forms" : kind === "EMAIL" ? "emails" : "documents");

const EMPTY_LIBRARY: WorkspaceLibrary = { visitForms: [], enquiryForms: [], blockTemplates: [], layouts: [] };

/** Where one of the library's opens, read-only, by its address: the builder its kind opens in. */
export function libraryHref(kind: BuildLibraryKind, key: string, blockKind?: string): string {
  if (kind === "VISIT_FORM") return buildHref("visit", key);
  if (kind === "ENQUIRY_FORM") return buildHref("enquiry", key);
  if (kind === "LAYOUT") return buildHref("layout", key);
  return buildHref("block", key, blockKind);
}

const asked = (fields: ReadonlyArray<{ type: FieldType }>) => fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type)).length;
const questions = (count: number) => `${count} ${count === 1 ? "question" : "questions"}`;

/** The layout of the library's a source prints with, by default, when the workspace has none: the newest for it. */
export function libraryDefaultLayouts(library: WorkspaceLibrary): Set<string> {
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const entry of library.layouts) {
    const at = `${entry.payload.sourceKey}|${entry.payload.documentType}|${entry.payload.targetType}`;
    if (seen.has(at)) continue;
    seen.add(at);
    ids.add(entry.id);
  }
  return ids;
}

/**
 * Corelith's starting points this workspace may use. A printed layout of
 * Corelith's is the default its documents print with until the workspace makes
 * its own default for that source (`ownDefaults`).
 */
export function corelithTemplates(
  provisions: BuildProvisions,
  enabledFeatures: readonly string[] | undefined,
  ownDefaults: ReadonlySet<string> = new Set(),
  library: WorkspaceLibrary = EMPTY_LIBRARY,
): BuildTemplate[] {
  const out: BuildTemplate[] = [];
  const libraryDefaults = libraryDefaultLayouts(library);
  const libraryLayoutFor = (entry: { sourceKey: string; documentType: string; targetType: string }) =>
    library.layouts.some(
      (layout) =>
        libraryDefaults.has(layout.id) &&
        layout.payload.sourceKey === entry.sourceKey &&
        layout.payload.documentType === entry.documentType &&
        layout.payload.targetType === entry.targetType,
    );
  if (provisions.enquiryForms) {
    out.push({
      key: "enquiry",
      name: "Enquiry form",
      description: "Who, the job and how they found you; each answer makes a lead",
      group: "forms",
      usedBy: "crm",
      badge: "Built in",
      start: { type: "enquiry" },
      href: null,
    });
  }
  if (provisions.visitForms) {
    for (const template of BUILDER_TEMPLATES) {
      const asked = template.fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type)).length;
      out.push({
        key: `visit:${template.key}`,
        name: template.name,
        description:
          template.group === "measured"
            ? `${template.description}${template.quoteLines.length ? "; drafts the quote" : ""}`
            : `${asked} questions from the question bank`,
        group: "forms",
        usedBy: "crm",
        badge: "Built in",
        start: { type: "visit", template: template.key },
        href: null,
      });
    }
  }
  if (provisions.blocks) {
    for (const starter of STARTER_TEMPLATES) {
      out.push({
        key: `block:${starter.id}`,
        name: starter.name,
        description: starter.description,
        group: blockGroup(starter.kind),
        usedBy: "crm",
        badge: "Built in",
        start: { type: "block", starter: starter.id, kind: starter.kind, name: starter.name },
        href: null,
      });
    }
  }
  for (const entry of DEFAULT_TEMPLATE_CATALOG) {
    if (!layoutProvisioned(entry.sourceKey, enabledFeatures)) continue;
    out.push({
      key: `layout:${entry.key}`,
      name: entry.name.replace(/ Default$/, ""),
      description: entry.description,
      group: "documents",
      usedBy: layoutUser(entry.sourceKey),
      // A layout of the library's for the same source stands in for it, as the workspace's own does.
      badge: ownDefaults.has(entry.sourceKey) || libraryLayoutFor(entry) ? "Built in" : "Default",
      start: { type: "layout", sourceKey: entry.sourceKey, documentType: entry.documentType, targetType: entry.targetType, name: entry.name.replace(/ Default$/, "") },
      href: `/build/templates/${encodeURIComponent(entry.key)}`,
    });
  }
  return [...out, ...libraryTemplates(library, ownDefaults, libraryDefaults)];
}

/** Corelith's library as starting points, beside the ones in code; each opens read-only and is used the same way. */
function libraryTemplates(library: WorkspaceLibrary, ownDefaults: ReadonlySet<string>, libraryDefaults: ReadonlySet<string>): BuildTemplate[] {
  const start = (kind: BuildLibraryKind, entry: { key: string; title: string }): TemplateStart => ({ type: "library", kind, key: entry.key, name: entry.title });
  return [
    ...library.visitForms.map((entry) => ({
      key: `library:${entry.key}`,
      name: entry.title,
      description: entry.summary ?? `${questions(asked(entry.payload.fields))}${entry.payload.quoteLines.length ? "; drafts the quote" : ""}`,
      group: "forms" as const,
      usedBy: "crm" as const,
      badge: null,
      start: start("VISIT_FORM", entry),
      href: libraryHref("VISIT_FORM", entry.key),
    })),
    ...library.enquiryForms.map((entry) => ({
      key: `library:${entry.key}`,
      name: entry.title,
      description: entry.summary ?? `Who, the job and ${questions(asked(entry.payload.fields))}; each answer makes a lead`,
      group: "forms" as const,
      usedBy: "crm" as const,
      badge: null,
      start: start("ENQUIRY_FORM", entry),
      href: libraryHref("ENQUIRY_FORM", entry.key),
    })),
    ...library.blockTemplates.map((entry) => ({
      key: `library:${entry.key}`,
      name: entry.title,
      description: entry.summary ?? entry.payload.attributes.description ?? "",
      group: blockGroup(entry.payload.kind),
      usedBy: "crm" as const,
      badge: null,
      start: start("BLOCK_TEMPLATE", entry),
      href: libraryHref("BLOCK_TEMPLATE", entry.key, entry.payload.kind),
    })),
    ...library.layouts.map((entry) => ({
      key: `library:${entry.key}`,
      name: entry.title,
      description: entry.summary ?? "",
      group: "documents" as const,
      usedBy: layoutUser(entry.payload.sourceKey),
      badge: libraryDefaults.has(entry.id) && !ownDefaults.has(entry.payload.sourceKey) ? "Default" : null,
      start: start("LAYOUT", entry),
      href: libraryHref("LAYOUT", entry.key),
    })),
  ];
}

/** The workspace's own forms, documents and emails, as templates to open. */
export function ownTemplates(items: readonly BuildItem[]): BuildTemplate[] {
  return items
    .filter((item) => item.kind !== "report")
    .map((item) => ({
      key: `own:${item.id}`,
      name: item.name,
      description: item.usedFor,
      group: item.kind === "form" ? "forms" : item.kind === "email" ? "emails" : "documents",
      usedBy: item.usedBy,
      badge: item.isDefault ? "Default" : item.status === "draft" ? "Draft" : null,
      start: null,
      href: item.href,
    }));
}

export type TemplatesView = {
  corelith: BuildTemplate[];
  made: BuildTemplate[];
  retired: BuildTemplate[];
};

export function templatesView(
  items: readonly BuildItem[],
  provisions: BuildProvisions,
  enabledFeatures: readonly string[] | undefined,
  library: WorkspaceLibrary = EMPTY_LIBRARY,
): TemplatesView {
  return {
    corelith: corelithTemplates(
      provisions,
      enabledFeatures,
      new Set(items.filter((item) => item.source === "layout" && item.isDefault && item.status !== "retired" && item.sourceKey).map((item) => item.sourceKey!)),
      library,
    ),
    made: ownTemplates(items.filter((item) => item.status !== "retired")),
    retired: ownTemplates(items.filter((item) => item.status === "retired")),
  };
}

export function readTemplateView(value: string | null): TemplateView {
  return value === "made" || value === "retired" ? value : "corelith";
}

/** The templates of one view, grouped as the page lists them, groups with none left out. */
export function groupTemplates(templates: readonly BuildTemplate[]): Array<{ group: TemplateGroup; rows: BuildTemplate[] }> {
  return (Object.keys(TEMPLATE_GROUP) as TemplateGroup[])
    .map((group) => ({ group, rows: templates.filter((template) => template.group === group) }))
    .filter((entry) => entry.rows.length > 0);
}
