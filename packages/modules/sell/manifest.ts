import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Sell: the till and everything around it. The manifest id is "retail", the
 * schema's module name, which the features and the routes carry; the product
 * the module makes is Sell, and the package is named for it. Data only.
 */
export const manifest: ModuleManifest = {
  id: "retail",
  requires: ["books", "offline", "records", "stock", "workflow"],
};
