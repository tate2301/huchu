/**
 * What this host composes, and how it authenticates.
 *
 * The kernel keeps registries it never populates itself: NextAuth's options
 * and the manifests of the modules a host composes, from which it reads the
 * permission catalog's capability sets and the gated routes. This file is the
 * one place that fills them for this host. Imported once at boot from
 * `instrumentation.ts`, and by any test that reads a registry.
 *
 * The auth options are handed over lazily. `lib/auth.ts` validates its
 * environment and builds the adapter when it loads, so importing it here would
 * make reading the composition cost the whole auth stack; the first request
 * that needs a session pays that import once instead, exactly as it did when
 * every page imported the options itself.
 */
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
import { registerModules, unmetModuleRequirements } from "@corelithzw/platform/manifest";
import { manifest as workflow, onApprovalAction } from "@corelithzw/module-workflow";
import { manifest as crm } from "@/lib/crm/manifest";

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);

registerModules([workflow, crm]);

// Code the modules hook into each other with, wired here and imported on first
// use, so reading the composition costs nothing but the manifests. After an
// approval action, for this host: the approvers are told.
onApprovalAction(async (tx, event) =>
  (await import("@/lib/notifications")).emitWorkflowNotificationFromApprovalAction(tx, event),
);

const unmet = unmetModuleRequirements();
if (unmet.length > 0) {
  throw new Error(
    `This host composes modules that require others it does not compose: ${unmet
      .map((entry) => `${entry.module} requires ${entry.requires}`)
      .join("; ")}.`,
  );
}
