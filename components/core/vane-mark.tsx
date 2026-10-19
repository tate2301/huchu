/**
 * Vane's mark: an ink tile with the surface-coloured vane arrow. It follows
 * the theme, so it reads as ink on white in light and light on dark in dark.
 */
export function VaneMark({ size = 16 }: { size?: 14 | 16 | 20 | 24 | 32 }) {
  return (
    <svg className="vn" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none" }}>
      <rect width="24" height="24" rx="6" fill="var(--color-ink, var(--ink))" />
      <path d="M5 12h10" stroke="var(--color-surface, var(--surface))" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19.5 12 14 8v8z" fill="var(--color-surface, var(--surface))" />
      <path
        d="M5 8.5 7.5 12 5 15.5"
        stroke="var(--color-surface, var(--surface))"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
