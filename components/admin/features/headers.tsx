import type { ReactNode } from "react";

import { AdminPageHeader } from "@/components/admin/page-header";

import { SectionTabs } from "./section-tabs";

/** A workspace's Verticals and features: its header, then Verticals, Bundles and Features on their own row. */
export function WorkspaceFeaturesHeader({ slug, actions }: { slug: string; actions?: ReactNode }) {
  const base = `/admin/w/${slug}/features`;
  return (
    <>
      <AdminPageHeader title="Verticals and features" actions={actions} />
      <SectionTabs
        label="Verticals and features"
        items={[
          { href: base, label: "Verticals" },
          { href: `${base}/bundles`, label: "Bundles" },
          { href: `${base}/all`, label: "Features" },
        ]}
      />
    </>
  );
}

/** The Catalogue: its header, then Features, Bundles and Templates on their own row. */
export function CatalogueHeader({ actions }: { actions?: ReactNode }) {
  return (
    <>
      <AdminPageHeader title="Catalogue" actions={actions} />
      <SectionTabs
        label="Catalogue"
        items={[
          { href: "/admin/catalogue", label: "Features" },
          { href: "/admin/catalogue/bundles", label: "Bundles" },
          { href: "/admin/catalogue/templates", label: "Templates" },
        ]}
      />
    </>
  );
}
