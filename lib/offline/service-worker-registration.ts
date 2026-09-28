/**
 * Whether this build runs the offline service worker.
 *
 * Only production builds do. `public/sw.js` serves `/_next/static/` cache-first,
 * which is safe when chunk URLs are content-hashed, but `next dev` serves
 * chunks at stable URLs — once the worker had cached one, the browser kept
 * running the old code across edits, dev-server restarts and a deleted `.next`.
 */
export const SERVICE_WORKER_ENABLED = process.env.NODE_ENV === "production";

function supportsServiceWorker() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Register `/sw.js` in production. In development, unregister any worker a
 * previous session left behind and delete its caches, so the next load comes
 * straight from the dev server.
 */
export async function registerServiceWorker(
  options: Omit<RegistrationOptions, "scope"> = {},
): Promise<ServiceWorkerRegistration | null> {
  if (!supportsServiceWorker()) return null;

  if (!SERVICE_WORKER_ENABLED) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (typeof caches !== "undefined") {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    return null;
  }

  return navigator.serviceWorker.register("/sw.js", { ...options, scope: "/" });
}

/**
 * The active registration, or null when the worker is disabled.
 *
 * `navigator.serviceWorker.ready` never settles without a registration, so
 * anything awaiting it must go through here.
 */
export async function getReadyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!SERVICE_WORKER_ENABLED || !supportsServiceWorker()) return null;
  return navigator.serviceWorker.ready.catch(() => null);
}
