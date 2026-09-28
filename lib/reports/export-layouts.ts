/**
 * The ways a report can be printed, by name. Kept apart from the layouts
 * themselves (`export-templates.ts`) so the export menu can list them without
 * shipping the document renderer to the browser.
 */

export const EXPORT_TEMPLATES = ["register", "summary", "pack", "sheets"] as const;
export type ExportTemplateId = (typeof EXPORT_TEMPLATES)[number];

export const EXPORT_TEMPLATE_LABELS: Record<ExportTemplateId, string> = {
  register: "Register",
  summary: "Summary",
  pack: "Management pack",
  sheets: "Record sheets",
};

/** Paper each template is laid out for. A register is wide; the rest read down a page. */
export const EXPORT_TEMPLATE_ORIENTATION: Record<ExportTemplateId, "portrait" | "landscape"> = {
  register: "landscape",
  summary: "portrait",
  pack: "portrait",
  sheets: "portrait",
};
