"use client";

import { Avatar } from "@corelithzw/react";

/**
 * A person, with a face.
 *
 * One binding of the design system's `Avatar` to the shape people take in this
 * module — a first and last name, and one day a photograph. It exists so that
 * every list of pupils and staff picks up the same initials, the same size
 * scale and the same name-derived colour, rather than each screen choosing.
 *
 * `accent="auto"` is the DS default and is what makes a class list scannable:
 * the same child is the same colour on the register, the mark sheet and the
 * homework board, so a teacher recognises a row before reading it.
 *
 * This is the mark alone. A list's first column wants the mark, the name and
 * the line that tells two rows apart as one composed cell — `PersonCell` in
 * `identity-cell.tsx` — and reaching for this instead is how eighteen screens
 * ended up with eighteen gaps between an avatar and a name.
 *
 * No school person carries a photograph yet — `SchoolStudent` has no image
 * column — so `src` is here for staff, whose `User.image` does exist, and for
 * pupils once uploads land.
 */
export function PersonAvatar({
  firstName,
  lastName,
  name,
  src,
  size = "sm",
}: {
  firstName?: string;
  lastName?: string;
  /** Use when the person arrives as one string, e.g. a staff `User.name`. */
  name?: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const full = name ?? [firstName, lastName].filter(Boolean).join(" ");
  return <Avatar name={full} size={size} {...(src ? { src } : {})} />;
}
