/**
 * What this host composes, and how it authenticates.
 *
 * The kernel keeps registries it never populates itself: NextAuth's options,
 * the permission catalog's capability sets, and the manifests of every module
 * as they are extracted. This file is the one place that fills them for this
 * host. Imported once at boot from `instrumentation.ts`, and by any test that
 * reads a registry.
 *
 * The auth options are handed over lazily. `lib/auth.ts` validates its
 * environment and builds the adapter when it loads, so importing it here would
 * make reading the composition cost the whole auth stack; the first request
 * that needs a session pays that import once instead, exactly as it did when
 * every page imported the options itself.
 */
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
import { registerCapabilities } from "@corelithzw/platform/permission-catalog";
import { CRM_CAPABILITY_SET } from "@/lib/crm/permissions";

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);
registerCapabilities(CRM_CAPABILITY_SET);
