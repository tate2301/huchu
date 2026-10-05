import { ArrowsLeftRight, ClipboardText, Clock, Stack } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/** Stock: how much there is, where it went, and counting it. */
export const stockNav: RetailNavModule = {
  id: "retail-stock",
  title: "Stock",
  icon: Stack,
  items: [
    { href: "/retail/stock", icon: Stack, label: "On hand", requires: [["retail.stock", "view"]] },
    { href: "/retail/stock/movements", icon: Clock, label: "Movements", requires: [["retail.stock", "view"]] },
    { href: "/retail/stock/counts", icon: ClipboardText, label: "Counts", requires: [["retail.stock", "view"]] },
    {
      href: "/retail/stock/transfers",
      icon: ArrowsLeftRight,
      label: "Transfers",
      requires: [["retail.stock", "view"]],
    },
  ],
};
