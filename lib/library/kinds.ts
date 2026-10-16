import type { LibraryKind } from "@prisma/client";
import { z } from "zod";

import {
  blockTemplatePayloadSchema,
  EMPTY_BLOCK_TEMPLATE,
  EMPTY_ENQUIRY_FORM,
  EMPTY_LAYOUT,
  EMPTY_VISIT_FORM,
  enquiryFormPayloadSchema,
  layoutPayloadSchema,
  visitFormPayloadSchema,
} from "./build-kinds";
import { EMPTY_EXPLORE, EMPTY_INSIGHT, EMPTY_REPORT, explorePayloadSchema, insightPayloadSchema, reportPayloadSchema } from "./report-kinds";

/**
 * What each kind of library item is: its name in the portal, the shape of its
 * payload, and where a workspace finds it once published. Each payload is the
 * shape the kind's own builder already reads and writes, so a published item
 * opens in a workspace exactly as one made there does.
 */

export type LibraryKindDefinition = {
  label: string;
  plural: string;
  /** Where a workspace finds it, in a phrase ("in Reports, under From Corelith"). */
  foundIn: string;
  payload: z.ZodTypeAny;
};

export const LIBRARY_KINDS: Record<LibraryKind, LibraryKindDefinition> = {
  REPORT: { label: "Report", plural: "Reports", foundIn: "in Reports, under From Corelith", payload: reportPayloadSchema },
  EXPLORE: { label: "Explore question", plural: "Explore questions", foundIn: "in Explore's templates", payload: explorePayloadSchema },
  INSIGHT: { label: "Insight", plural: "Insights", foundIn: "on Insights, when its answer has rows", payload: insightPayloadSchema },
  VISIT_FORM: { label: "Site-visit form", plural: "Site-visit forms", foundIn: "in Build, under From Corelith", payload: visitFormPayloadSchema },
  ENQUIRY_FORM: { label: "Enquiry form", plural: "Enquiry forms", foundIn: "in Build, under From Corelith", payload: enquiryFormPayloadSchema },
  BLOCK_TEMPLATE: {
    label: "Template",
    plural: "Templates",
    foundIn: "in Build, under From Corelith",
    payload: blockTemplatePayloadSchema,
  },
  LAYOUT: { label: "Printed layout", plural: "Printed layouts", foundIn: "in Build's layouts, as Corelith's", payload: layoutPayloadSchema },
};

export const LIBRARY_KIND_ORDER: readonly LibraryKind[] = ["REPORT", "EXPLORE", "INSIGHT", "VISIT_FORM", "ENQUIRY_FORM", "BLOCK_TEMPLATE", "LAYOUT"];

/** The URL word for a kind (`/admin/library/explore`), and back. */
export const KIND_SLUG: Record<LibraryKind, string> = {
  REPORT: "reports",
  EXPLORE: "explore",
  INSIGHT: "insights",
  VISIT_FORM: "visit-forms",
  ENQUIRY_FORM: "enquiry-forms",
  BLOCK_TEMPLATE: "templates",
  LAYOUT: "layouts",
};

export function kindFromSlug(slug: string): LibraryKind | null {
  return (Object.entries(KIND_SLUG).find(([, value]) => value === slug)?.[0] as LibraryKind | undefined) ?? null;
}

/** What a new item of a kind starts as, before anything is built. */
export const EMPTY_PAYLOAD: Record<LibraryKind, unknown> = {
  REPORT: EMPTY_REPORT,
  EXPLORE: EMPTY_EXPLORE,
  INSIGHT: EMPTY_INSIGHT,
  VISIT_FORM: EMPTY_VISIT_FORM,
  ENQUIRY_FORM: EMPTY_ENQUIRY_FORM,
  BLOCK_TEMPLATE: EMPTY_BLOCK_TEMPLATE,
  LAYOUT: EMPTY_LAYOUT,
};
