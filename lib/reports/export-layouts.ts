/**
 * The ways a report can be printed, by name. Kept apart from the layouts
 * themselves (`export-templates.ts`) so the export menu can list them without
 * shipping the document renderer to the browser.
 */

export const EXPORT_TEMPLATES = ["layout", "register", "summary", "pack", "sheets"] as const;
export type ExportTemplateId = (typeof EXPORT_TEMPLATES)[number];

export const EXPORT_TEMPLATE_LABELS: Record<ExportTemplateId, string> = {
  layout: "Report",
  register: "Register",
  summary: "Summary",
  pack: "Management pack",
  sheets: "Record sheets",
};

/** Past this many columns a table needs the long side of the paper. */
const WIDE_TABLE = 7;

/**
 * The paper a layout is printed on. A register is wide; the report as laid out
 * turns when its table would not fit down the page; the rest read down it.
 */
export function orientationFor(template: ExportTemplateId, columnCount: number): "portrait" | "landscape" {
  if (template === "register") return "landscape";
  if (template === "layout") return columnCount > WIDE_TABLE ? "landscape" : "portrait";
  return "portrait";
}
