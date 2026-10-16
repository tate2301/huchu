import type { MaterialIconProps } from "@/lib/icons";

/**
 * Vane's mark among the rail's modules: the vane arrow of `VaneMark` without
 * its ink tile, in the current colour like every other module mark, so the
 * place (`/vane`) reads apart from the tile at the rail's foot that opens
 * Vane's chat.
 */
export function VaneGlyph({ className, style, size, ...props }: MaterialIconProps) {
  const label = props["aria-label"];
  return (
    <svg
      className={className}
      style={style}
      width={size ?? "1em"}
      height={size ?? "1em"}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      fill="none"
    >
      <path d="M3.5 12h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M21.5 12 14.5 7v10z" fill="currentColor" />
      <path d="M3.5 7.5 6.5 12l-3 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
