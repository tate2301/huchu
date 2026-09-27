/**
 * Groups — records somebody put together by hand (a campaign, a shortlist).
 *
 * Stored as `CrmList`. On screen they are "groups": a "list" is what every
 * page in the CRM already is, and "add to list" beside a list of records
 * reads as nothing.
 */
import { REGISTERS, isEngineRegisterKey } from "@/lib/crm/registers/registry";
import { writeState } from "@/lib/crm/registers/codec";

export const GROUP_ENTITY_LABELS = {
  PERSON: "People",
  COMPANY: "Companies",
  SITE: "Sites",
  LEAD: "Leads",
  DEAL: "Deals",
  WORK_ORDER: "Jobs",
} as const;

export type GroupEntity = keyof typeof GROUP_ENTITY_LABELS;

/**
 * Where a group opens: its record type's own list, narrowed to the group,
 * where it can be searched, sorted and exported like any other slice. A
 * record type not on the list engine yet still opens the group's own page.
 */
export function groupHref(entity: string, groupId: string): string {
  if (isEngineRegisterKey(entity)) {
    const def = REGISTERS[entity];
    return `${def.route}?${writeState(def, { filters: { group: [groupId] } })}`;
  }
  return `/crm/lists/${groupId}`;
}
