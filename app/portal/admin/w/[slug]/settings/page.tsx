import { notFound } from "next/navigation";

import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { SettingsPanel } from "@/components/admin/settings/settings-panel";
import { getPlatformRootDomain } from "@/lib/admin/hosts";
import { findWorkspace } from "@/lib/admin/workspaces";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";
import { signInAsCode } from "@/lib/sign-in-as/sessions";

import {
  changeAddress,
  close,
  deleteForGood,
  endSession,
  previewReset,
  reinstate,
  rename,
  reopen,
  resetData,
  signOutEveryone,
  suspend,
} from "./actions";

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [operator, workspace] = await Promise.all([requireOperator(), findWorkspace(slug)]);
  if (!workspace) notFound();
  const [company, open] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: workspace.id }, select: { tenantStatus: true } }),
    prisma.signInAsSession.findMany({
      where: { companyId: workspace.id, endedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { startedAt: "desc" },
      select: { id: true, number: true, mode: true, expiresAt: true, operator: { select: { name: true } }, member: { select: { name: true } } },
    }),
  ]);
  const root = getPlatformRootDomain();
  const can = (action: Parameters<typeof operatorCan>[1]) => operatorCan(operator.role, action);

  return (
    <AdminPage>
      <AdminPageHeader title="Settings" />
      <SettingsPanel
        workspace={{ name: workspace.name, slug: workspace.slug }}
        root={root}
        status={company.tenantStatus}
        sessions={open.map((session) => ({
          id: session.id,
          code: signInAsCode(session.number),
          operator: session.operator.name,
          member: session.member.name,
          mode: session.mode,
          until: session.expiresAt,
        }))}
        can={{
          edit: can("workspace.edit"),
          signOut: can("workspace.signEveryoneOut"),
          endSessions: can("member.signInAs"),
          export: can("workspace.export"),
          suspend: can("workspace.suspend"),
          close: can("workspace.close"),
        }}
        accessRecordHref={`/api/platform-admin/w/${workspace.slug}/access-record`}
        actions={{
          rename: rename.bind(null, slug),
          changeAddress: changeAddress.bind(null, slug),
          signOutEveryone: signOutEveryone.bind(null, slug),
          endSession: endSession.bind(null, slug),
          suspend: suspend.bind(null, slug),
          reinstate: reinstate.bind(null, slug),
          close: close.bind(null, slug),
          reopen: reopen.bind(null, slug),
          deleteForGood: deleteForGood.bind(null, slug),
          previewReset: previewReset.bind(null, slug),
          resetData: resetData.bind(null, slug),
        }}
      />
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `Settings · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
