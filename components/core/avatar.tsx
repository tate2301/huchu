"use client";

import * as React from "react";

/**
 * A person's or a profile's face (owner, 19 Oct): the photo when there is one
 * and it loads, else their initials on a soft tint picked from the name, so the
 * same person is the same colour on every page. Never an empty grey circle.
 * The boards draw it with `ck.avatar()` (design/core-modules/tools/boards/ck.py),
 * from the same initials and the same tint.
 *
 * Tables use 20 or 24, so a row keeps its height; 32 is for record headers and
 * rails. 28 and 40 are there for the older wrappers that delegate here.
 *
 * Businesses with no profile (suppliers, banks, ZIMRA, the workspace) get none.
 */
export type AvatarSize = 20 | 24 | 28 | 32 | 40;

const TINTS = 5;

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "sr", "prof", "rev"]);

/** Two letters: the first of the first two words, or the first two of one word ("Mrs R. Chuma" is "RC"). */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length > 1 && HONORIFICS.has(words[0]!.toLowerCase())) words.shift();
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

/** 0 to 4, from the name: the sum of its character codes. `ck.avatar_tint` is the same sum. */
export function avatarTint(name: string | null | undefined): number {
  let sum = 0;
  for (const ch of (name ?? "").trim()) sum += ch.codePointAt(0) ?? 0;
  return sum % TINTS;
}

export function Avatar({
  name,
  src,
  size = 20,
  className,
  title,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  /** A tooltip, for an avatar shown without its name beside it. */
  title?: string;
}) {
  const [failed, setFailed] = React.useState<string | null>(null);
  const photo = src && failed !== src ? src : null;
  return (
    <span
      className={["k-av", className].filter(Boolean).join(" ")}
      data-size={size}
      data-tint={avatarTint(name)}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      {photo ? (
        // A profile photo is an arbitrary URL, not one `next/image` can list.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" onError={() => setFailed(photo)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/**
 * The avatar and the name on one line, truncating; an optional sub-line (a
 * role, a team) follows the name in muted text, or sits under it with `stack`
 * (record headers and rails, where there is room for two lines).
 */
export function Person({
  name,
  src,
  sub,
  size = 20,
  stack = false,
  className,
  children,
}: {
  name: string | null | undefined;
  src?: string | null;
  sub?: React.ReactNode;
  size?: AvatarSize;
  stack?: boolean;
  className?: string;
  /** The name as something else (a link); `name` still sets the initials. */
  children?: React.ReactNode;
}) {
  return (
    <span className={["k-person", stack && "is-stack", className].filter(Boolean).join(" ")}>
      <Avatar name={name} src={src} size={size} />
      <span className="k-person-t">
        <span className="k-person-n">{children ?? name}</span>
        {sub ? <span className="k-person-s">{sub}</span> : null}
      </span>
    </span>
  );
}

/** A few people at once (who is asking, who it is shared with): their avatars, overlapping by 4px. */
export function Avatars({ people, size = 20, max = 4 }: { people: Array<{ name: string; image?: string | null }>; size?: AvatarSize; max?: number }) {
  if (!people.length) return null;
  return (
    <span className="k-avs" title={people.map((person) => person.name).join(", ")}>
      {people.slice(0, max).map((person, index) => (
        <Avatar key={`${person.name}-${index}`} name={person.name} src={person.image} size={size} />
      ))}
    </span>
  );
}
