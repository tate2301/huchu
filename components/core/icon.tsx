import { ICONS, type IconName } from "./icons";

export type { IconName };

/** The one glyph not on the 24 grid: WhatsApp's own mark, drawn on its 256 grid as the boards draw it. */
const VIEWBOX: Partial<Record<IconName, string>> = { remind: "0 0 256 258" };

/**
 * One of the kit's filled icons on its 24 grid, drawn at 16 (`.ic`) or 20.
 * Decorative: the control around it carries the name.
 */

export function Icon({ name, size = 16, className }: { name: IconName; size?: 16 | 20; className?: string }) {
  const cls = ["ic", size === 20 ? "ic-20" : null, className].filter(Boolean).join(" ");
  return <svg className={cls} viewBox={VIEWBOX[name] ?? "0 0 24 24"} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}
