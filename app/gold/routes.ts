export const goldRoutes = {
  command: "/gold",
  intake: {
    pours: "/gold/intake/pours",
    newPour: "/gold/intake/pours/new",
  },
  transit: {
    dispatches: "/gold/transit/dispatches",
    newDispatch: "/gold/transit/dispatches/new",
  },
  settlement: {
    receipts: "/gold/settlement/receipts",
    newReceipt: "/gold/settlement/receipts/new",
    payouts: "/gold/settlement/payouts",
  },
  exceptions: {
    home: "/gold/exceptions",
  },
  reporting: {
    home: "/reports/gold-chain",
  },
} as const;

export type GoldLegacyView =
  | "menu"
  | "pour"
  | "dispatch"
  | "receipt"
  | "payouts"
  | "reconciliation"
  | "audit";

export function mapLegacyGoldViewToRoute(view: GoldLegacyView): string {
  if (view === "menu") return goldRoutes.command;
  if (view === "pour") return goldRoutes.intake.newPour;
  if (view === "dispatch") return goldRoutes.transit.newDispatch;
  if (view === "receipt") return goldRoutes.settlement.newReceipt;
  if (view === "payouts") return goldRoutes.settlement.payouts;
  return goldRoutes.exceptions.home;
}
