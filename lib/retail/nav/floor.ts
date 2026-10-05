import { CashRegister, Receipt, SquaresFour, Storefront, Users } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/** The floor: today's trading, the tills and the people buying. */
export const floorNav: RetailNavModule = {
  id: "retail-floor",
  title: "The floor",
  icon: Storefront,
  items: [
    // The workspace root: current on `/retail` itself, never on the pages under it.
    { href: "/retail", icon: SquaresFour, label: "Overview", exact: true, requires: [["retail.reports", "view"]] },
    { href: "/retail/sales", icon: Receipt, label: "Sales", requires: [["retail.sell", "view"]] },
    {
      href: "/retail/shifts",
      icon: CashRegister,
      label: "Shifts",
      // A cashier's are their own: the list's server scopes it.
      requires: [
        ["retail.cash-control", "view"],
        ["retail.sell", "open-shift"],
      ],
    },
    { href: "/retail/customers", icon: Users, label: "Customers", requires: [["retail.sell", "view"]] },
  ],
};
