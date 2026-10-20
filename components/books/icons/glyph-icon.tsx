import * as React from "react";

import type { CiGlyph, CiStyle } from "./types";

/**
 * The style every Books icon takes unless it says otherwise. Icons v2 makes
 * fill duo the default (design/books/spec/open.md): that is this one line.
 */
export const CI_DEFAULT_STYLE: CiStyle = "outline";

/** The style a current row, a pressed tab or a chosen module takes. */
export const CI_ACTIVE_STYLE: CiStyle = "fill";

/**
 * The fill styles cut their shapes with masks whose ids the pack writes once
 * per icon (`ci-home-fill-0`). Each drawing gets its own, so two copies of an
 * icon on one page never resolve to each other's mask.
 */
function scoped(markup: string, uid: string) {
  return markup.includes("id=\"") ? markup.replace(/ci-[a-z0-9-]+?-(fill(?:-duo)?)-(\d+)/g, `${uid}-$1-$2`) : markup;
}

export type CiIconProps = {
  glyph: CiGlyph;
  style?: CiStyle;
  /** 18 is the pack's grid; 16 sits in dense rows, 20 in a page title on the phone. */
  size?: 14 | 16 | 18 | 20;
  className?: string;
  /** Read out only where the icon stands alone; beside a label it is decorative. */
  label?: string;
};

/** One Corelith UI icon (design/books/spec/icons.md), on the pack's 18 grid. */
export function CiGlyphIcon({ glyph, style = CI_DEFAULT_STYLE, size = 18, className, label }: CiIconProps) {
  const uid = `ci${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      className={["ci", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: scoped(glyph[style], uid) }}
    />
  );
}
