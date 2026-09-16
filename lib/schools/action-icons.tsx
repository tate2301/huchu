/**
 * The mark every school verb wears.
 *
 * ## Why this is one map and not a prop on each button
 *
 * A verb's icon belongs to what the verb *means*, not to the screen it happens
 * to be on. Left to each call site, "Edit" is a pencil on the roll and a gear
 * on the fee ledger, and the reader has to re-learn the row on every screen —
 * which is the opposite of what icons are for.
 *
 * `SchoolAction` is a closed union of 27 values and every `RecordVerb` already
 * declares one. So pairing the action with a mark here gives all ~280 verbs in
 * the module a consistent icon without a single call site changing, and makes
 * the next new verb a compile error until somebody decides what it looks like.
 *
 * ## Icon AND label, never icon alone
 *
 * `docs/design-system/05-rules.md`: *never signal state by colour alone —
 * colour + icon + text, always*. The same reasoning applies to a verb. These
 * marks make a familiar row scannable; they do not make an unfamiliar one
 * readable, and a menu of bare glyphs is a menu you have to hover to use.
 * `RecordActions` and `CreateButton` therefore render the icon *beside* the
 * word, never instead of it.
 *
 * ## How the marks were chosen
 *
 * Three rules, in order:
 *
 * 1. **The destructive ones must not look alike.** `archive`, `void`,
 *    `write-off` and `unpublish` are four similar-sounding words that do four
 *    different and hard-to-undo things, and in a menu they are read under time
 *    pressure. They get four visibly different marks — a box, a prohibition
 *    sign, a struck circle, a closed eye — so the shape disambiguates before
 *    the word is finished.
 * 2. **Money is money.** `issue`, `receive-payment`, `refund`, `waive` and
 *    `write-off` all move a family's balance, so they share a financial
 *    vocabulary rather than borrowing generic document marks.
 * 3. **Direction means direction.** `check-in` points down into the building,
 *    `check-out` points up out of it, and `refund` and `request-changes` both
 *    turn back on themselves. Nobody should have to learn these.
 */

import type { SchoolAction } from "@/lib/schools/access";
import {
  Archive,
  ArrowBendUpLeft,
  ArrowLineDown,
  ArrowLineUp,
  ArrowUDownLeft,
  CalendarCheck,
  CalendarPlus,
  Check,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  GearSix,
  Home,
  Lock,
  Megaphone,
  Money,
  Pencil,
  Percent,
  Plus,
  Prohibit,
  Scale,
  Send,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "@/lib/icons";

/**
 * Every action, and the mark it wears.
 *
 * `Record<SchoolAction, ...>` rather than a partial map on purpose: adding a
 * verb to the union without deciding what it looks like should not compile.
 */
export const ACTION_ICON: Record<SchoolAction, LucideIcon> = {
  // Reading and writing the record itself.
  view: Eye,
  create: Plus,
  edit: Pencil,
  configure: GearSix,

  // Taking something out of circulation. Deliberately four distinct shapes —
  // see rule 1 above.
  archive: Archive,
  void: Prohibit,
  "write-off": XCircle,
  unpublish: EyeOff,

  // The approval chain. A submission goes up, a decision comes back.
  capture: ClipboardList,
  submit: Send,
  moderate: Scale,
  approve: Check,
  "request-changes": ArrowUDownLeft,
  publish: Send,
  lock: Lock,

  // Money owed to the school.
  issue: FileText,
  "receive-payment": Money,
  waive: Percent,
  refund: ArrowUDownLeft,

  // The house.
  "allocate-bed": Home,
  "approve-leave": CalendarCheck,
  "check-in": ArrowLineDown,
  "check-out": ArrowLineUp,

  // Talking to families.
  invite: UserPlus,
  "notify-families": Megaphone,
  reply: ArrowBendUpLeft,
  "book-meeting": CalendarPlus,
};

/** The mark for an action. */
export function actionIcon(action: SchoolAction): LucideIcon {
  return ACTION_ICON[action];
}

/**
 * An action's mark, as a component.
 *
 * Use this rather than `const Icon = actionIcon(action)` inside a render. That
 * form *creates* a component during render, so React sees a new type on every
 * pass and remounts the subtree — which is what `react-hooks/static-components`
 * catches, and it caught it here. This component is defined once at module
 * scope and merely chooses which glyph to draw.
 *
 * Always `aria-hidden`: every caller puts the verb's word beside it, so the
 * mark is decoration and a screen reader announcing "pencil Edit" is reading
 * the same thing twice.
 */
export function ActionIcon({
  action,
  className = "size-4",
}: {
  action: SchoolAction;
  className?: string;
}) {
  const Icon = ACTION_ICON[action];
  return <Icon className={className} aria-hidden="true" />;
}
