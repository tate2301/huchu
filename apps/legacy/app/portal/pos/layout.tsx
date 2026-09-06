import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PosPortalProvider } from "@corelithzw/module-sell/components/portal/pos-portal-state";
import { PosPortalLayoutFrame } from "@corelithzw/module-sell/components/portal/pos-portal-layout-frame";
import { PosTillLockProvider } from "@corelithzw/module-sell/components/portal/pos-lock-screen";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@corelithzw/platform/tenant";
import { resolveWorkspaceIdentityForHost } from "@corelithzw/platform/workspace-identity";

export default async function PosPortalLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/pos");
  const workspace = await resolveWorkspaceIdentityForHost(hostHeader);

  return (
    <PosPortalProvider isPosHost={portalRouting.isPortalHost}>
      {/*
        S-7.5. The lock wraps the whole till, not a single screen: a cashier
        stepping away leaves whichever view they were on, and the basket has to
        be covered wherever they left it. The provider renders the PIN screen
        over its children when locked, so mounting it here is the whole wiring.
      */}
      <PosTillLockProvider>
        <PosPortalLayoutFrame
          workspaceName={workspace.workspaceName}
          workspaceInitial={workspace.initial}
        >
          {children}
        </PosPortalLayoutFrame>
      </PosTillLockProvider>
    </PosPortalProvider>
  );
}
