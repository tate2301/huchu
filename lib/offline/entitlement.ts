import { hasTokenFeature } from "@/lib/platform/gating/token-check";

/**
 * What the signed-in session is entitled to, readable from outside React.
 *
 * ## Why this exists
 *
 * `lib/offline/module-registry.ts` declares what each module preloads for
 * offline use, and it is a plain module — no hooks, no session. So it
 * prefetched everything it listed, for everybody, on every page of every
 * module that carried it. People is foundational to all five verticals, which
 * means the HR preload set runs on a gold mine and on a school.
 *
 * What that cost — both found by the e2e suite, neither on a page that so much
 * as mentions the endpoint:
 *
 *   - a gold **clerk** opening `/gold/prices` took two 403s on `/api/sites`,
 *     which is gated on `admin.sites-sections`: a screen about the gold price,
 *     failing on site administration
 *   - a **cashier** signing into the till took a 403 on
 *     `/api/v2/retail/promotions`
 *
 * They alternated between runs, because which prefetch lands before an
 * assertion is a race. That is the tell for this class of bug: a failure that
 * moves is usually one cause firing opportunistically, not several causes.
 *
 * ## Why a module-level holder
 *
 * `OfflinePreloadQuery` already had `enabled?: () => boolean`, honoured in
 * `prefetchModuleQueries`. The hook was there; nothing could answer it, because
 * the registry cannot see a session. The provider can — it reads
 * `enabledFeatures` off the token already — so it publishes them here and the
 * registry reads them back.
 *
 * Deliberately not a React context: the registry is imported by the offline
 * bootstrap as well as by components, and a context would make it unusable from
 * one of the two places that needs it.
 *
 * Empty until the provider has a session, so `hasOfflineFeature` answers
 * `false` until then. That is the safe way round — a prefetch not yet made
 * costs nothing, and one made too early costs a 403 in somebody's console.
 */
let entitledFeatures: string[] = [];

/** Called by `OfflineProvider` whenever the session's features change. */
export function setOfflineEntitlements(features: string[] | undefined): void {
  entitledFeatures = features ?? [];
}

/**
 * Whether the current session may reach a feature. **False before sign-in.**
 *
 * The empty check is not redundant, and leaving it out was a bug in the first
 * version of this file. `hasTokenFeature` delegates to `evaluateFeature`, which
 * treats an empty list as "we do not know yet" and, under the platform's
 * allow-by-default policy, answers **allowed** — see
 * `lib/platform/gating/enforcer.ts:36`. That is the right answer for a server
 * guard deciding whether to serve a page before claims are enriched. It is the
 * wrong one here: this gate exists to stop a prefetch, and a prefetch that
 * cannot tell whether it is entitled should not run.
 *
 * So the gate failed open in exactly the window it was written for — the moment
 * before the provider has published anything, which is when the offline
 * preloader fires. The e2e suite caught it the same way it caught the original:
 * a gold clerk taking two 403s on `/api/sites` from a page about the gold price.
 *
 * A prefetch not made costs nothing; one made too early costs a 403 in
 * somebody's console and, on a metered connection, a round trip for nothing.
 */
export function hasOfflineFeature(featureKey: string): boolean {
  if (entitledFeatures.length === 0) return false;
  return hasTokenFeature(entitledFeatures, featureKey);
}
