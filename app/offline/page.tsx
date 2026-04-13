export default function OfflineFallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[color-mix(in_srgb,var(--surface-canvas)_92%,white)] px-6 py-10">
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading"
        className="size-10 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--surface-muted)_88%,white)] border-t-[var(--action-primary-bg)]"
      />
    </main>
  );
}
