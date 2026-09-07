import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Stock: the catalogue, price lists, stock locations and movements. What the
 * business holds and what it sells; the CRM quotes from it and the till sells
 * from it, so both require it. Requires people (the storeman an issue goes to)
 * and records (the history feed its movements render in). Data only.
 */
export const manifest: ModuleManifest = {
  id: "stock",
  requires: ["people", "records", "books", "documents"],
};
