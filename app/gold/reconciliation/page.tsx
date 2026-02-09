"use client";

import { useRouter } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { ReconciliationView } from "@/app/gold/components/reconciliation-view";

const goldRoutes = {
  menu: "/gold",
  pour: "/gold/pour",
  dispatch: "/gold/dispatch",
  receipt: "/gold/receipt",
  reconciliation: "/gold/reconciliation",
  audit: "/gold/audit",
} as const;

type GoldView = keyof typeof goldRoutes;

export default function GoldReconciliationPage() {
  const router = useRouter();

  const handleNavigate = (view: GoldView) => {
    router.push(goldRoutes[view]);
  };

  return (
    <GoldShell activeTab="reconciliation" description="Track the full gold chain">
      <ReconciliationView setViewMode={handleNavigate} />
    </GoldShell>
  );
}
