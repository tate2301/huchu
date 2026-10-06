import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PosPortalProvider } from "@/components/retail/portal/pos-portal-state";
import { PosPortalLayoutFrame } from "@/components/retail/portal/pos-portal-layout-frame";
import { PosTillLockProvider } from "@/components/retail/portal/pos-lock-screen";
import { PosCashDropPrompt } from "@/components/retail/portal/pos-cash-drop-prompt";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { resolveWorkspaceIdentityForHost } from "@/lib/platform/workspace-identity";
import { deviceForPage, isPairedTill } from "../device-page";

export default async function PosPortalLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/pos");
  const [workspace, { device }] = await Promise.all([resolveWorkspaceIdentityForHost(hostHeader), deviceForPage()]);

  return (
    /*
      Only price check opens on a device that is not a till (the page guards
      send everything else to /pair). There the provider leaves the device
      alone: no till context, no shift, no heartbeat, no watch.
    */
    <PosPortalProvider isPosHost={portalRouting.isPortalHost} paired={isPairedTill(device)}>
      {/*
        S-7.5. The lock wraps the whole till, not a single screen: a cashier
        stepping away leaves whichever view they were on, and the basket has to
        be covered wherever they left it. The provider renders the PIN screen
        over its children when locked, so mounting it here is the whole wiring.
      */}
      <PosTillLockProvider>
        {/* SET-06: the till rules' cash drop prompt, asked only while the till is unlocked. */}
        <PosCashDropPrompt />
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
