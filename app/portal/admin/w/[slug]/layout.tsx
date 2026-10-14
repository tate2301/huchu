import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/shell/admin-shell";
import { findWorkspace } from "@/lib/admin/workspaces";
import { requireOperator } from "@/lib/operators/guards";

/**
 * One workspace's context. The workspace is the URL's, and every page and
 * action under it reads it from there — never from a form field.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const operator = await requireOperator();
  const workspace = await findWorkspace((await params).slug);
  if (!workspace) notFound();
  return (
    <AdminShell
      operator={operator}
      workspace={{
        slug: workspace.slug,
        name: workspace.name,
        product: workspace.product,
        profile: workspace.profile,
        standing: workspace.standing,
      }}
    >
      {children}
    </AdminShell>
  );
}
