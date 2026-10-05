import { ChartBar } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/** Insights: the seven questions an owner asks of the shop, one page each. */
export const insightsNav: RetailNavModule = {
  id: "retail-control",
  title: "Insights",
  icon: ChartBar,
  items: [
    { href: "/retail/insights/sales", icon: ChartBar, label: "Sales", requires: [["retail.insights", "view"]] },
    { href: "/retail/insights/profit", icon: ChartBar, label: "Profit", requires: [["retail.insights", "view"]] },
    { href: "/retail/insights/products", icon: ChartBar, label: "Products", requires: [["retail.insights", "view"]] },
    { href: "/retail/insights/stock", icon: ChartBar, label: "Stock health", requires: [["retail.insights", "view"]] },
    { href: "/retail/insights/losses", icon: ChartBar, label: "Losses", requires: [["retail.insights", "view"]] },
    { href: "/retail/insights/customers", icon: ChartBar, label: "Customers", requires: [["retail.insights", "view"]] },
    // Managers do not see Money (the Roles board).
    { href: "/retail/insights/money", icon: ChartBar, label: "Money", requires: [["retail.money", "view"]] },
  ],
};
