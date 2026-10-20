import * as React from "react";

import { cn } from "@/lib/utils";

import { Glyph } from "./glyph";

export type FaceSize = 18 | 20 | 24 | 28 | 32 | 40 | 56;

export type Person = {
  id: string;
  name: string;
  /** A photo, when there is one. Without it the face is a person glyph on the fill. */
  photo?: string;
};

/** A person is a face; no photo yet is a person glyph on the fill. */
export function Face({
  person,
  size = 28,
  className,
  style,
  label,
}: {
  person?: Pick<Person, "name" | "photo">;
  size?: FaceSize;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  const cls = cn("face", size !== 28 && `face-${size}`, className);
  if (person?.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cls} src={person.photo} alt={label ?? ""} style={style} />;
  }
  return (
    <span className={cls} style={style} role={label ? "img" : undefined} aria-label={label}>
      <Glyph name="person" size="sm" />
    </span>
  );
}

/** Faces side by side, each overlapping the one before. */
export function Faces({ className, children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className={cn("faces", className)} style={style}>
      {children}
    </span>
  );
}

export type PresenceKind = "here" | "away" | "talk";

/** A face with its presence mark: a green dot while here, an open ring when away, a pulsing ring while talking. */
export function Pres({ kind = "here", children }: { kind?: PresenceKind; children: React.ReactNode }) {
  return <span className={cn("pres", kind === "away" && "pres--away", kind === "talk" && "pres--talk")}>{children}</span>;
}
