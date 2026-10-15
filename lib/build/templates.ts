import { BUILDER_TEMPLATES } from "@/lib/crm/site-visits/builder-templates";
import { STARTER_TEMPLATES } from "@/lib/crm/starter-templates";
import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";
import { DISPLAY_FIELD_TYPES } from "@/lib/forms/fields";

import type { BuildItem } from "./items";
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
  | { type: "layout"; sourceKey: string; documentType: string; targetType: string; name: string };

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

/**
 * Corelith's starting points this workspace may use. A printed layout of
 * Corelith's is the default its documents print with until the workspace makes
 * its own default for that source (`ownDefaults`).
 */
export function corelithTemplates(
  provisions: BuildProvisions,
  enabledFeatures: readonly string[] | undefined,
  ownDefaults: ReadonlySet<string> = new Set(),
): BuildTemplate[] {
  const out: BuildTemplate[] = [];
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
      badge: ownDefaults.has(entry.sourceKey) ? "Built in" : "Default",
      start: { type: "layout", sourceKey: entry.sourceKey, documentType: entry.documentType, targetType: entry.targetType, name: entry.name.replace(/ Default$/, "") },
      href: `/build/templates/${encodeURIComponent(entry.key)}`,
    });
  }
  return out;
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

export function templatesView(items: readonly BuildItem[], provisions: BuildProvisions, enabledFeatures: readonly string[] | undefined): TemplatesView {
  return {
    corelith: corelithTemplates(
      provisions,
      enabledFeatures,
      new Set(items.filter((item) => item.source === "layout" && item.isDefault && item.status !== "retired" && item.sourceKey).map((item) => item.sourceKey!)),
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
