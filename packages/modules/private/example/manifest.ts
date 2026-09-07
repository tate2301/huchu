import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * A client's own module declares itself exactly as a product module does. Its
 * id carries the `private-` prefix, which no public module's ever does, so the
 * registries and the boundary test tell the two apart by name alone.
 *
 * The route is gated by a feature key like any other. A real client module's
 * key is the one its contract grants — a bundle the tenant holds — and until
 * a module's bundles live in its manifest (see the plan's Phase 5 decisions)
 * that bundle is declared in the kernel's catalogue. This example gates on a
 * key every tenant has.
 */
export const manifest: ModuleManifest = {
  id: "private-example",
  routes: [
    { scope: "page", prefix: "/private/example", featureKey: "core.auth.login" },
    { scope: "api", prefix: "/api/v2/private/example", featureKey: "core.auth.login" },
  ],
};
