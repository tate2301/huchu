/**
 * The management & preferences design layer.
 *
 * Every component here takes its content as props and fetches nothing. No
 * query key, mutation, permission predicate or feature flag lives in this
 * directory, and none should: the surface is a drawing of state the pages
 * already load, and the two shells it replaces are what made presentation and
 * access control hard to tell apart in the first place.
 *
 * The paint is in `settings.module.css`, in `@layer components` — above the
 * design system, below Tailwind's utilities, so a caller's `className` still
 * wins.
 *
 * Boards: `Main`, `Rail`, `Opening`, `States`, `Fields`, `Sections`,
 * `Classes`, `Audit`.
 *
 * The CRM's money pages — finance, the cost tracker, projects, requisitions
 * and a team member's page — draw their sections, lists, facts and states
 * with these same pieces, outside the surface and without its dialog, so the
 * contract reads the same on both sides.
 */

export { SettingsSurface, type SettingsSurfaceProps } from "./settings-surface";

export {
  SettingsRail,
  type SettingsRailProps,
  type SettingsRailGroup,
  type SettingsRailItem,
} from "./settings-rail";

export { RegisterLayout, type RegisterLayoutProps } from "./register-layout";

export {
  ListColumn,
  ListRow,
  type ListColumnProps,
  type ListColumnSearch,
  type ListColumnState,
  type ListRowProps,
} from "./list-column";

export {
  RecordHeader,
  HeaderAction,
  type RecordHeaderProps,
  type HeaderActionProps,
} from "./record-header";

export {
  SectionHeading,
  SectionAction,
  type SectionHeadingProps,
  type SectionActionProps,
} from "./section-heading";

export {
  RecordList,
  type RecordListProps,
  type RecordListRow,
  type RecordListValue,
} from "./record-list";

export {
  ColumnList,
  ColumnName,
  ColumnFigure,
  ColumnText,
  ColumnRowAction,
  type ColumnListProps,
  type ColumnListColumn,
  type ColumnListRow,
  type ColumnNameProps,
  type ColumnFigureProps,
} from "./column-list";

export { FactList, type FactListProps, type FactListItem } from "./fact-list";

export {
  StatusBadge,
  StatusDot,
  type StatusBadgeProps,
  type StatusDotProps,
  type StatusContext,
  type StatusTone,
} from "./status";

export { FormPage, FormField, type FormPageProps, type FormFieldProps } from "./form-page";

export {
  ActivityTrail,
  ActivityPayload,
  activityToneFor,
  type ActivityTrailProps,
  type ActivityPayloadProps,
  type ActivityEvent,
  type ActivityTone,
} from "./activity-trail";
