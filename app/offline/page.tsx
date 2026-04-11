export default function OfflineFallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Offline
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          This page has not been prepared for offline use yet.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Reconnect to the internet so the app can warm this route and keep its latest data available on the device.
        </p>
      </div>
    </main>
  );
}
