import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Documents: one render pipeline for everything the product prints. What gets
 * printed is the owning module's business — it registers a source
 * (`registerDocumentSource`) and declares its default templates in its
 * manifest (`documents.templates`).
 */
export const manifest: ModuleManifest = {
  id: "documents",
  requires: ["records"],
};
