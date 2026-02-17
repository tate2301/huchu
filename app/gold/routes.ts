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
