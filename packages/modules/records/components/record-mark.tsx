"use client";

import { createElement } from "react";

import { Avatar, Emoji, IconTile } from "@corelithzw/react";
import {
  MedusaBookOpenIcon,
  Building2,
  Checklist,
  Home,
  FileText,
  Funnel,
  ManageAccounts,
  MapPin,
  Package,
  TableRows,
  Receipt,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";
import { recordAccent } from "@corelithzw/ui/lib/ui/record-accent";

/**
 * The mark that stands for a record in a list, a card or a page header.
 *
 * Three rules, in order:
 *
 *   1. An uploaded picture wins. Somebody chose it.
 *   2. Otherwise, people and sales reps get an avatar — initials, or their
 *      photo. A person is the one kind of record where the reader is looking
 *      for a *who*, and a generic person glyph repeated down a list tells them
 *      nothing; two letters at least differ row to row.
 *   3. Everything else gets its emoji if it has one, and its entity icon if
 *      not. A company is a company; the icon says which column of the world
 *      this row belongs to, and the emoji is there for when somebody wants
 *      this particular company to be findable at a glance.
 */

export type RecordKind =
  | "person"
  | "rep"
  | "company"
  | "deal"
  | "lead"
  | "site"
  | "task"
  | "document"
  | "work-order"
  | "product"
  | "receipt"
  // Schools (S-4.3). A student, a guardian and a teacher are people and take
  // the avatar branch; a class, a subject and a hostel are things and take the
  // tile.
  | "student"
  | "guardian"
  | "teacher"
  | "class"
  | "subject"
  | "hostel";

const KIND_ICON: Record<RecordKind, LucideIcon> = {
  person: Users,
  rep: UserRound,
  company: Building2,
  deal: Funnel,
  lead: Funnel,
  site: MapPin,
  task: Checklist,
  document: FileText,
  "work-order": Wrench,
  product: Package,
  receipt: Receipt,
  student: Users,
  guardian: Users,
  teacher: ManageAccounts,
  class: TableRows,
  subject: MedusaBookOpenIcon,
  hostel: Home,
};

/**
 * A stand-in emoji per entity, used where a record has none of its own. These
 * are placeholders — the point today is that every kind of thing has *a* mark
 * rather than a blank space, and they are one edit away from being replaced.
 */
export const KIND_EMOJI: Record<RecordKind, string> = {
  person: "🧑",
  rep: "🧑‍💼",
  company: "🏢",
  deal: "📈",
  lead: "✨",
  site: "📍",
  task: "✅",
  document: "📄",
  "work-order": "🔧",
  product: "📦",
  receipt: "🧾",
  student: "🎒",
  guardian: "👪",
  teacher: "🧑‍🏫",
  class: "🪧",
  subject: "📐",
  hostel: "🏠",
};

const AVATAR_SIZE = { sm: "sm", md: "sm", lg: "md" } as const;
const TILE_SIZE = { sm: "sm", md: "md", lg: "lg" } as const;
/** Emoji artwork is sized in pixels, matched to the tile it sits in. */
const EMOJI_PX = { sm: 16, md: 18, lg: 22 } as const;

export function RecordMark({
  kind,
  name,
  emoji,
  avatarUrl,
  accent,
  size = "sm",
  className,
}: {
  kind: RecordKind;
  /** Used for an avatar's initials and for the accessible label. */
  name?: string | null;
  /** The record's own emoji, if it has been given one. */
  emoji?: string | null;
  /** An uploaded display picture. Beats everything else. */
  avatarUrl?: string | null;
  /**
   * The record's chosen colour. Left off, a hue is derived from its name —
   * which is what stops a list being a column of identical grey squares
   * without anybody having to colour two hundred rows by hand.
   */
  accent?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  // A student, a guardian and a teacher are read the same way a CRM person is:
  // the reader is looking for a *who*, and a column of identical glyphs answers
  // nothing. Initials differ row to row.
  const isPerson =
    kind === "person" ||
    kind === "rep" ||
    kind === "student" ||
    kind === "guardian" ||
    kind === "teacher";

  const hue = recordAccent(accent, name);

  if (avatarUrl) {
    return (
      <Avatar
        size={AVATAR_SIZE[size]}
        src={avatarUrl}
        name={name ?? undefined}
        className={className}
      />
    );
  }

  if (isPerson) {
    return (
      <Avatar
        size={AVATAR_SIZE[size]}
        name={name || "?"}
        accent={hue}
        className={className}
      />
    );
  }

  return (
    <IconTile
      accent={hue}
      size={TILE_SIZE[size]}
      className={className}
      role={emoji ? "img" : undefined}
      aria-label={emoji ? (name ?? undefined) : undefined}
    >
      {emoji ? (
        // `label=""` because the tile already carries the accessible name —
        // otherwise a screen reader reads the glyph's name and the record's.
        <Emoji emoji={emoji} label="" size={EMOJI_PX[size]} />
      ) : (
        createElement(KIND_ICON[kind], { className: "size-4" })
      )}
    </IconTile>
  );
}
