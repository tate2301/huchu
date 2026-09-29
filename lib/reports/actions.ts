import type { FieldDefinition } from "@/lib/forms/fields";
import type { ReportRow, RowTemplate } from "@/lib/reports/types";

/**
 * Filling a row action in from its row.
 *
 * A hole that is blank does not fill: `/crm/deals/{dealId}` on a quote with no
 * deal is not a link to `/crm/deals/`, it is no link, and the next template in
 * the list gets its turn. Values are URI-encoded because they land in paths.
 */
export function fillTemplate(template: RowTemplate, row: ReportRow, encode = true): string | null {
  for (const candidate of Array.isArray(template) ? template : [template]) {
    let complete = true;
    const filled = candidate.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = row[key];
      if (value === null || value === undefined || value === "") {
        complete = false;
        return "";
      }
      return encode ? encodeURIComponent(String(value)) : String(value);
    });
    if (complete) return filled;
  }
  return null;
}

/**
 * A form's answers as a PATCH body. A field left blank clears the value rather
 * than sending an empty string for a number or a date to choke on.
 */
export function answersToBody(fields: FieldDefinition[], answers: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const answer = answers[field.key];
    if (answer === undefined) continue;
    if (answer === null || answer === "") {
      body[field.key] = null;
    } else if (field.type === "number" || field.type === "rating") {
      const n = Number(answer);
      body[field.key] = Number.isFinite(n) ? n : null;
    } else {
      body[field.key] = answer;
    }
  }
  return body;
}
