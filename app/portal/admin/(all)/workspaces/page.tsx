import type { WorkspaceProduct } from "@prisma/client";

import Link from "next/link";

import { UrlTabs, UrlToolbar } from "@/components/admin/list-controls";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { WorkspacesTable } from "@/components/admin/workspaces/workspaces-table";
import { STANDINGS, type Standing } from "@/lib/admin/standing";
import { listWorkspaces } from "@/lib/admin/workspaces";
import { Plus } from "@/lib/icons";

export const metadata = { title: "Workspaces · Corelith admin" };

/** The tabs: everything, then the standings someone acts on. Active and closed are filters nobody works from. */
const TABS: Standing[] = ["Trial", "Past due", "Read-only", "Setting up", "Suspended"];

const slug = (standing: Standing) => standing.toLowerCase().replace(/\s+/g, "-");

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; product?: string }>;
}) {
  const params = await searchParams;
  const standing = STANDINGS.find((candidate) => slug(candidate) === params.tab) ?? null;
  const product = params.product === "CORELITH" || params.product === "FLARE" ? (params.product as WorkspaceProduct) : null;
  const { rows, counts } = await listWorkspaces({ q: params.q, product, standing });

  return (
    <AdminPage>
      <AdminPageHeader
        title="Workspaces"
        actions={
          <Link href="/admin/workspaces/new" className="btn btn-primary no-underline">
            <Plus aria-hidden="true" />
            Set up workspace
          </Link>
        }
      />
      <UrlTabs
        label="Workspaces by standing"
        tabs={[
          { value: null, label: "All", count: counts.All },
          ...TABS.map((tab) => ({ value: slug(tab), label: tab, count: counts[tab] })),
        ]}
      />
      <UrlToolbar
        searchPlaceholder="Find a workspace or person"
        filters={[{ param: "product", label: "Product", anyLabel: "Any product", options: [["CORELITH", "Corelith"], ["FLARE", "Flare"]] }]}
        count={`${rows.length} ${rows.length === 1 ? "workspace" : "workspaces"}`}
      />
      <WorkspacesTable
        rows={rows}
        emptyTitle={params.q ? `No workspace matches “${params.q}”` : "No workspace stands here"}
      />
    </AdminPage>
  );
}
