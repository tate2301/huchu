import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Records: the shared record page, mark, attribute editor and custom fields,
 * the subject of a task, comment or file, and the one search box. Every module
 * with records declares them in its own manifest (`records.types`) and hands
 * the host a search arm; this module owns none of them.
 */
export const manifest: ModuleManifest = {
  id: "records",
};
