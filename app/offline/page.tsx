export default function OfflineFallbackPage() {
  return (
    <main className="flex min-h-screen bg-[color-mix(in_srgb,var(--surface-canvas)_92%,white)] px-6 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center">
        <div className="w-full rounded-[28px] bg-[color-mix(in_srgb,var(--surface-base)_92%,white)] px-8 py-10 shadow-[0_12px_32px_-24px_rgba(17,17,17,0.18)]">
          <div className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <span className="size-1.5 rounded-full bg-[color-mix(in_srgb,var(--status-warning-text)_72%,white)]" />
            Offline
          </div>
          <h1 className="mt-4 max-w-[18ch] text-[2rem] font-semibold tracking-[-0.03em] text-foreground">
            This page is not prepared for offline use yet.
          </h1>
          <p className="mt-3 max-w-[58ch] text-sm leading-6 text-[var(--text-muted)]">
            Reconnect so the app can warm this route and keep its latest data ready on the device.
          </p>
        </div>
      </div>
    </main>
  );
}
