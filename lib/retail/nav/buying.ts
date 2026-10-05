import { Money, TrayArrowDown, Truck } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/** Buying: what the shop orders, receives and asks money for. */
export const buyingNav: RetailNavModule = {
  id: "retail-buy",
  title: "Buying",
  icon: TrayArrowDown,
  items: [
    { href: "/retail/buying/orders", icon: TrayArrowDown, label: "Orders", requires: [["retail.purchasing", "view"]] },
    { href: "/retail/buying/deliveries", icon: Truck, label: "Deliveries", requires: [["retail.purchasing", "view"]] },
    {
      href: "/retail/buying/requisitions",
      icon: Money,
      label: "Requisitions",
      // A cashier's and a stock clerk's are their own: the list's server scopes it.
      requires: [["retail.requisitions", "view"]],
    },
  ],
};
