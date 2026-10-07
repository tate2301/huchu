/**
 * What a site-visit form can be started from, for the builder's gallery.
 * The templates are the product's, not the tenant's, so this only describes them.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { BUILDER_TEMPLATES } from "@/lib/crm/site-visits/builder-templates";
import { DISPLAY_FIELD_TYPES, FIELD_TYPE_LABELS } from "@/lib/forms/fields";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;

    return successResponse({
      data: BUILDER_TEMPLATES.map((template) => {
        const asked = template.fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type));
        return {
          key: template.key,
          name: template.name,
          description: template.description,
          kind: template.kind,
          group: template.group,
          questionCount: asked.length,
          quoteLineCount: template.quoteLines.length,
          /** The first few questions, for the card's sketch of the form. */
          preview: asked.slice(0, 4).map((field) => ({ label: field.label, kind: FIELD_TYPE_LABELS[field.type] })),
        };
      }),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/question-sets/templates error:", error);
    return errorResponse("Failed to load the templates");
  }
}
