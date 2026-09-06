/**
 * The directory: what another module may know about the people who work here.
 *
 * Campus links a teacher, Stock issues to a storeman, Gold pays a crew. They
 * read employees through this subpath and nothing else of this module; the
 * plan names it `directory` for that reason. It starts with the search arm's
 * result shape and the linkable-user client and grows as the readers arrive.
 */
export {
  fetchDisciplinaryActions,
  fetchEmployees,
  fetchHrIncidents,
  fetchLinkableUsers,
  fetchShiftGroup,
  fetchShiftGroupMembers,
  fetchShiftGroupSchedules,
  fetchShiftGroups,
  type DisciplinaryActionRecord,
  type EmployeeModuleValue,
  type EmployeeSummary,
  type HrIncidentRecord,
  type LinkableUser,
  type ShiftGroupMemberRecord,
  type ShiftGroupRecord,
  type ShiftGroupScheduleRecord,
} from "./api-client";
export { PEOPLE_SEARCH_FEATURES, PEOPLE_SEARCH_RESOURCES, PEOPLE_SEARCH_TYPES, searchPeople, type PeopleSearchType } from "./people/search";
