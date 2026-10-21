import { CI_GLYPHS, type CiName } from "./glyphs";
import { CiGlyphIcon, type CiIconProps } from "./glyph-icon";

/** A Corelith UI icon by its pack name. Books pages only: it carries the whole pack. */
export function CiIcon({ name, ...rest }: Omit<CiIconProps, "glyph"> & { name: CiName }) {
  return <CiGlyphIcon glyph={CI_GLYPHS[name]} {...rest} />;
}

export { CI_ACTIVE_STYLE, CI_DEFAULT_STYLE, CiGlyphIcon } from "./glyph-icon";
export type { CiName };
