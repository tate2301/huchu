import { isOrgAdminRole } from "@/lib/preferences/nav";
import type { ReportParam, ReportParams, ReportView } from "@/lib/reports/types";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

/**
 * Who sees, changes and shares a report template.
 *
 * A template is somebody's way of looking at a report, kept under a name. It
 * never widens what a person may read: whoever opens one still reads the
 * report's rows under their own role, so these rules only decide whether the
 * template is listed for them and who may change it.
 */

export const TEMPLATE_AUDIENCES = ["JUST_ME", "MANAGERS", "EVERYONE"] as const;
export type TemplateAudience = (typeof TEMPLATE_AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<TemplateAudience, string> = {
  JUST_ME: "Just me",
  MANAGERS: "Managers",
  EVERYONE: "Everyone",
};

/**
 * "Managers", as an audience: the owner, managers, shop managers and the
 * bookkeeper (70-insights-reports 3.3), in both products.
 */
export const TEMPLATE_MANAGER_ROLES = ["SUPERADMIN", "MANAGER", "SHOP_MANAGER", "FINANCE_OFFICER"] as const;

/** A template as its reader is told about it. */
export type ReportTemplateRecord = {
  id: string;
  reportKey: string;
  reportTitle: string;
  /** The source's area: a Reports area slug for a retail source ("stock"), the catalogue's section otherwise. */
  area: string;
  name: string;
  description: string | null;
  view: ReportView;
  params: ReportParams;
  audience: TemplateAudience;
  madeBy: string;
  madeById: string;
  mine: boolean;
  canChange: boolean;
  createdAt: string;
  updatedAt: string;
  /** How often it was opened in this workspace, and when last. */
  opens: number;
  lastOpenedAt: string | null;
  /** Its own weekly email; filled once templates send (INS-09). */
  email: null;
};

type Person = { id: string; role: string };
/** A built-in has no maker. */
type Owned = { audience: TemplateAudience; createdById: string | null };

function isTemplateManager(role: string): boolean {
  return (TEMPLATE_MANAGER_ROLES as readonly string[]).includes(role);
}

/**
 * Listed for this person: theirs, or its audience includes their role.
 * Retail callers also check `retail.reports:view` and a read of the source
 * (C-35: "Everyone" is everyone who opens Reports).
 */
export function canSeeTemplate(template: Owned, person: Person): boolean {
  if (template.createdById !== null && template.createdById === person.id) return true;
  if (template.audience === "EVERYONE") return true;
  if (template.audience === "MANAGERS") return isTemplateManager(person.role);
  return false;
}

/** W-75: rename, re-share, re-save or delete — whoever made it, or the owner once it is shared. */
export function canChangeTemplate(template: Owned, person: Person): boolean {
  if (template.createdById === null) return false;
  if (template.createdById === person.id) return true;
  return person.role === "SUPERADMIN" && template.audience !== "JUST_ME";
}

/** W-73: saving and sharing a retail template are the owner's and the managers'. */
export function canSaveTemplates(role: string): boolean {
  return canRetailRoleDo(role, "retail.reports", "create");
}

/** Anyone keeps a template for themselves; sharing it is a manager's call. */
export function canShareWith(audience: TemplateAudience, role: string): boolean {
  return audience === "JUST_ME" || isOrgAdminRole(role);
}

/**
 * The params a template keeps from what was on screen.
 *
 * Choices always: they are part of what the template is about. Dates only when
 * asked to keep them; otherwise the template opens on the report's own period,
 * so "this month" is this month whenever it is opened.
 */
export function paramsToKeep(declared: readonly ReportParam[], shown: ReportParams, keepDates: boolean): ReportParams {
  const kept: ReportParams = {};
  for (const param of declared) {
    if (!(param.key in shown)) continue;
    if (param.type === "date" && !keepDates) continue;
    kept[param.key] = shown[param.key]!;
  }
  return kept;
}
