import type { ModuleManifest } from "@corelithzw/platform/manifest";
import { POS_ALL_PUBLIC_PATHS } from "./pos-host";

/**
 * Sell: the till and everything around it. The manifest id is "retail", the
 * schema's module name, which the features and the routes carry; the product
 * the module makes is Sell, and the package is named for it. Data only.
 */
export const manifest: ModuleManifest = {
  id: "retail",
  portals: [
    {
      key: "pos",
      homeRoles: ["POS_CASHIER", "CASHIER"],
      signInRoles: ["CASHIER", "POS_CASHIER"],
      signInDeniedReason: "POS_PORTAL_ACCESS_REQUIRED",
      publicPaths: POS_ALL_PUBLIC_PATHS,
      pinRolesToHost: true,
    },
  ],
  requires: ["books", "offline", "records", "stock", "workflow"],
};
