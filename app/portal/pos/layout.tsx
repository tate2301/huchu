import type { ReactNode } from "react";
import { PosPortalProvider } from "@/components/retail/portal/pos-portal-state";

export default function PosPortalLayout({ children }: { children: ReactNode }) {
  return <PosPortalProvider>{children}</PosPortalProvider>;
}
