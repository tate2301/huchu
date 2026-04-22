import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PosPortalProvider } from "@/components/retail/portal/pos-portal-state";
import { PosPortalLayoutFrame } from "@/components/retail/portal/pos-portal-layout-frame";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { resolveWorkspaceIdentityForHost } from "@/lib/platform/workspace-identity";

export default async function PosPortalLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/pos");
  const workspace = await resolveWorkspaceIdentityForHost(hostHeader);

  return (
    <PosPortalProvider isPosHost={portalRouting.isPortalHost}>
      <PosPortalLayoutFrame
        workspaceName={workspace.workspaceName}
        workspaceInitial={workspace.initial}
      >
        {children}
      </PosPortalLayoutFrame>
    </PosPortalProvider>
  );
}
