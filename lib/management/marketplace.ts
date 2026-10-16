import type { PrismaClient } from "@prisma/client";

import { libraryHref } from "@/lib/build/templates";
import type { WorkspaceLibrary } from "@/lib/library/workspace";
import { FEATURE_BUNDLES } from "@/lib/platform/feature-catalog";

/**
 * Management → Marketplace (design/core-modules/html/management-marketplace.html):
 * what a workspace can add, by kind, each with who makes it, its price and
 * where Add takes it. Built from what exists: Corelith's report templates,
 * its document templates, the forms, templates and layouts its library
 * publishes to the workspace, and the add-ons the workspace does not have yet.
 * Add-ons carry no charge of their own: a workspace pays for its verticals
 * (`lib/platform/verticals.ts`), and Corelith switches an add-on on within
 * them. There are no partner apps in the product, so none are listed.
 */

export type MarketKind = "forms" | "reports" | "documents" | "apps";

export type MarketItem = {
  key: string;
  kind: MarketKind;
  name: string;
  detail: string;
  maker: string;
  price: string;
  /** Where Add goes: the report to make your own, the templates, the plan. */
  href: string;
  mark?: string;
};

export type MarketSection = { title: string; items: MarketItem[] };

const ADDON_MARKS: Record<string, string> = {
  ADDON_CRM_SUITE: "/brand/flare-mark.svg",
  ADDON_RETAIL_SUITE: "/brand/tender-mark.svg",
  ADDON_ADVANCED_PAYROLL: "/brand/shift-mark.svg",
  ADDON_STORES_CORE: "/brand/silo-mark.svg",
};

export async function readMarketplace(
  db: Pick<PrismaClient, "documentTemplate" | "companySubscriptionAddon">,
  companyId: string,
  {
    reportTemplates,
    verticalName,
    library,
  }: {
    /** Corelith's report templates this person can open (`templatesFor`). */
    reportTemplates: ReadonlyArray<{ key: string; title: string; description: string | null }>;
    /** "flooring", "schools": what the first section is for. */
    verticalName: string;
    /** What Corelith's library publishes to the workspace and it runs the module for (`readWorkspaceLibrary`). */
    library?: WorkspaceLibrary;
  },
): Promise<MarketSection[]> {
  const [documents, enabled] = await Promise.all([
    db.documentTemplate.findMany({
      where: { scope: "SYSTEM", isActive: true },
      orderBy: [{ documentType: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, documentType: true },
    }),
    db.companySubscriptionAddon.findMany({ where: { companyId, isEnabled: true }, select: { bundle: { select: { code: true } } } }),
  ]);
  const have = new Set(enabled.map((addon) => addon.bundle.code));

  const ours: MarketItem[] = [
    ...reportTemplates.map((template) => ({
      key: `report:${template.key}`,
      kind: "reports" as const,
      name: template.title,
      detail: template.description ?? "A report to make your own",
      maker: "Corelith",
      price: "Free",
      href: `/reports/built/${template.key}`,
    })),
    ...libraryItems(library),
    ...documents.map((template) => ({
      key: `document:${template.id}`,
      kind: "documents" as const,
      name: template.name,
      detail: template.description ?? `A ${template.documentType.toLowerCase().replace(/_/g, " ")} to send out`,
      maker: "Corelith",
      price: "Free",
      href: "/build/templates",
    })),
  ];

  const addons: MarketItem[] = FEATURE_BUNDLES.filter(
    // Base bundles come with every workspace of their kind; the rest can be added, at no charge.
    (bundle) => bundle.code.startsWith("ADDON_") && !bundle.base && !have.has(bundle.code),
  ).map((bundle) => ({
    key: `addon:${bundle.code}`,
    kind: "apps",
    name: bundle.name,
    detail: bundle.description.replace(/\.$/, ""),
    maker: "Corelith",
    price: "Included",
    href: "/preferences/organization/billing",
    mark: ADDON_MARKS[bundle.code],
  }));

  return [
    { title: `For ${verticalName}`, items: ours },
    { title: "Add-ons from Corelith", items: addons },
  ].filter((section) => section.items.length > 0);
}

/** The library's forms, templates and layouts: each opens read-only in Build, where Use this template copies it. */
function libraryItems(library: WorkspaceLibrary | undefined): MarketItem[] {
  if (!library) return [];
  const item = (kind: MarketKind, entry: { key: string; title: string; summary: string | null }, detail: string, href: string): MarketItem => ({
    key: `library:${entry.key}`,
    kind,
    name: entry.title,
    detail: entry.summary ?? detail,
    maker: "Corelith",
    price: "Free",
    href,
  });
  return [
    ...library.visitForms.map((entry) => item("forms", entry, "A site-visit form to make your own", libraryHref("VISIT_FORM", entry.key))),
    ...library.enquiryForms.map((entry) => item("forms", entry, "An enquiry form to make your own", libraryHref("ENQUIRY_FORM", entry.key))),
    ...library.blockTemplates.map((entry) =>
      item(
        entry.payload.kind === "FORM" ? "forms" : "documents",
        entry,
        entry.payload.kind === "FORM" ? "A form to make your own" : "A template to make your own",
        libraryHref("BLOCK_TEMPLATE", entry.key, entry.payload.kind),
      ),
    ),
    ...library.layouts.map((entry) => item("documents", entry, "A printed layout to make your own", libraryHref("LAYOUT", entry.key))),
  ];
}

/** What a workspace of this profile does, for "For …". */
export function verticalName(profile: string | null | undefined): string {
  switch (profile) {
    case "RETAIL":
      return "your shop";
    case "SCHOOLS":
      return "your school";
    case "GOLD_MINE":
      return "your mine";
    case "PAYROLL":
      return "your payroll";
    default:
      return "your business";
  }
}
