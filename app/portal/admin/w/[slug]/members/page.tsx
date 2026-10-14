import { notFound } from "next/navigation";

import { MembersTable } from "@/components/admin/members/members-table";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { listMembers, roleOptions } from "@/lib/admin/members";
import { findWorkspace } from "@/lib/admin/workspaces";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";

import { changeRole, giveAccessBack, removeAccess, signInAs, signOutEverywhere } from "./actions";

export default async function WorkspaceMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [operator, workspace] = await Promise.all([requireOperator(), findWorkspace(slug)]);
  if (!workspace) notFound();
  const profile = await prisma.company.findUniqueOrThrow({ where: { id: workspace.id }, select: { workspaceProfile: true } });
  const [members, roles] = await Promise.all([
    listMembers(workspace.id),
    roleOptions({ id: workspace.id, workspaceProfile: profile.workspaceProfile }),
  ]);

  return (
    <AdminPage>
      <AdminPageHeader title="Members" />
      <MembersTable
        workspaceName={workspace.name}
        members={members}
        roles={roles}
        ownerName={workspace.owner?.name ?? null}
        can={{
          manage: operatorCan(operator.role, "member.manage"),
          signInAs: operatorCan(operator.role, "member.signInAs"),
          signInAsChange: operatorCan(operator.role, "member.signInAsChange"),
        }}
        actions={{
          // Bound to this page's workspace; each action refuses a member who is not in it.
          changeRole: changeRole.bind(null, slug),
          signOutEverywhere: signOutEverywhere.bind(null, slug),
          removeAccess: removeAccess.bind(null, slug),
          giveAccessBack: giveAccessBack.bind(null, slug),
          signInAs: signInAs.bind(null, slug),
        }}
      />
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `Members · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
