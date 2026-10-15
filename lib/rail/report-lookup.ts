import { customTemplate, templateReads } from "@/lib/reports/custom/templates";
import { getReportDefinition } from "@/lib/reports/registry";

import type { PanelReport } from "./reports";

/**
 * A report as the panel lists it, read from the registry the server lists it
 * from (`/api/v2/reports/panel`), for the one report a page is: so a module's
 * panel can mark the report being looked at before its list has loaded.
 * Whether the person may open it is still the page's and the API's to say.
 */
export function staticPanelReport(key: string): PanelReport | null {
  if (key.startsWith("built-")) {
    const templateKey = key.slice("built-".length);
    const template = customTemplate(templateKey);
    if (!template) return null;
    return {
      key,
      title: template.title,
      href: `/reports/built/${templateKey}`,
      about: (templateReads().get(templateKey) ?? [])
        .map((read) => getReportDefinition(read)?.href)
        .filter((href): href is string => Boolean(href)),
    };
  }
  const definition = getReportDefinition(key);
  if (!definition) return null;
  return { key, title: definition.title, href: `/reports/${key}`, about: definition.href ? [definition.href] : [] };
}
