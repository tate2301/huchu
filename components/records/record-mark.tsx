"use client";

import { createElement } from "react";

import { Avatar, Emoji, IconTile } from "@corelithzw/react";
import { ciNavIcon } from "@/components/books/icons/nav-icon";
import {
  ci_book_open,
  ci_box,
  ci_briefcase,
  ci_building,
  ci_handshake,
  ci_home,
  ci_list_check,
  ci_map_pin,
  ci_pipeline,
  ci_receipt,
  ci_sheet,
  ci_table,
  ci_tool,
  ci_user_circle,
  ci_users,
} from "@/components/books/icons/glyphs";
import type { LucideIcon } from "@/lib/icons";
import { recordAccent } from "@/lib/ui/record-accent";
import { cn } from "@/lib/utils";

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
  | "hostel"
  | "project";

const KIND_ICON: Record<RecordKind, LucideIcon> = {
  person: ciNavIcon(ci_users),
  rep: ciNavIcon(ci_user_circle),
  company: ciNavIcon(ci_building),
  deal: ciNavIcon(ci_handshake),
  lead: ciNavIcon(ci_pipeline),
  site: ciNavIcon(ci_map_pin),
  task: ciNavIcon(ci_list_check),
  document: ciNavIcon(ci_sheet),
  "work-order": ciNavIcon(ci_tool),
  product: ciNavIcon(ci_box),
  receipt: ciNavIcon(ci_receipt),
  student: ciNavIcon(ci_users),
  guardian: ciNavIcon(ci_users),
  teacher: ciNavIcon(ci_user_circle),
  class: ciNavIcon(ci_table),
  subject: ciNavIcon(ci_book_open),
  hostel: ciNavIcon(ci_home),
  project: ciNavIcon(ci_briefcase),
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
  project: "🏗️",
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
        className={cn("rounded-full", className)}
      />
    );
  }

  if (isPerson || (name && !emoji)) {
    return (
      <Avatar
        size={AVATAR_SIZE[size]}
        name={name || "?"}
        accent={hue}
        className={cn("rounded-full", className)}
      />
    );
  }

  return (
    <IconTile
      accent={hue}
      size={TILE_SIZE[size]}
      className={cn("rounded-full [&]:rounded-full", className)}
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
