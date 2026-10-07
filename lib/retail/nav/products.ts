import { Folder, Megaphone, Package, Rows, Tag } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/** Products: what the shop sells and at what price. */
export const productsNav: RetailNavModule = {
  id: "retail-products",
  title: "Products",
  icon: Tag,
  items: [
    { href: "/retail/products", icon: Rows, label: "Products", requires: [["retail.catalog", "view"]] },
    {
      href: "/retail/products/price-lists",
      icon: Tag,
      label: "Price lists",
      requires: [["retail.prices", "view"]],
    },
    {
      href: "/retail/products/promotions",
      icon: Megaphone,
      label: "Promotions",
      requires: [["retail.promotions", "view"]],
    },
    {
      href: "/retail/products/bundles",
      icon: Package,
      label: "Bundles and packs",
      requires: [["retail.promotions", "view"]],
    },
    {
      href: "/retail/products/categories",
      icon: Folder,
      label: "Categories",
      requires: [["retail.categories", "view"]],
    },
  ],
};
