import type { LucideIcon, MaterialIconProps } from "@/lib/icons";

import { CI_ACTIVE_STYLE, CiGlyphIcon } from "./glyph-icon";
import type { CiGlyph } from "./types";

/**
 * A Corelith UI icon in the shape the shell's panel takes (`LucideIcon`), for
 * Books' rows only. The panel marks the current row's icon `data-current`;
 * that one is drawn filled, every other outline (design/books/spec/icons.md).
 */
export function ciNavIcon(glyph: CiGlyph): LucideIcon {
  function CiNavIcon({ className, ...props }: MaterialIconProps & { "data-current"?: boolean }) {
    const current = props["data-current"] === true;
    return <CiGlyphIcon glyph={glyph} className={className} style={current ? CI_ACTIVE_STYLE : undefined} />;
  }
  CiNavIcon.displayName = `CiNavIcon(${glyph.name})`;
  return CiNavIcon as LucideIcon;
}
