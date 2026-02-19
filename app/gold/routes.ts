export const goldRoutes = {
  home: "/gold",
  command: "/gold",
  intake: {
    pours: "/gold/intake/pours",
    create: "/gold/intake/pours?create=1",
    newPour: "/gold/intake/pours/new",
  },
  transit: {
    dispatches: "/gold/transit/dispatches",
    create: "/gold/transit/dispatches?create=1",
    newDispatch: "/gold/transit/dispatches/new",
  },
  settlement: {
    receipts: "/gold/settlement/receipts",
    create: "/gold/settlement/receipts?create=1",
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
