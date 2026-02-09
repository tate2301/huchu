"use client";

import { useRouter } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { AuditTrail } from "@/app/gold/components/audit-trail";

const goldRoutes = {
  menu: "/gold",
  pour: "/gold/pour",
  dispatch: "/gold/dispatch",
  receipt: "/gold/receipt",
  reconciliation: "/gold/reconciliation",
  audit: "/gold/audit",
} as const;

type GoldView = keyof typeof goldRoutes;

export default function GoldAuditPage() {
  const router = useRouter();

  const handleNavigate = (view: GoldView) => {
    router.push(goldRoutes[view]);
  };

  return (
    <GoldShell activeTab="audit" description="Immutable audit trail">
      <AuditTrail setViewMode={handleNavigate} />
    </GoldShell>
  );
}
