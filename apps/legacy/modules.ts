/**
 * How this host is wired: the code its modules hook into each other with, and
 * how it authenticates. What it composes is `manifests.ts`, imported first.
 *
 * Server only. Imported once at boot from `instrumentation.ts`, and by any
 * test that reads a registry the code below fills.
 *
 * The auth options are handed over lazily. `lib/auth.ts` validates its
 * environment and builds the adapter when it loads, so importing it here would
 * make reading the composition cost the whole auth stack; the first request
 * that needs a session pays that import once instead, exactly as it did when
 * every page imported the options itself.
 */
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
import "./manifests";
import { registerSearchArm } from "@corelithzw/module-records";
import { onApprovalAction } from "@corelithzw/module-workflow";

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);

// Code the modules hook into each other with, wired here and imported on first
// use, so reading the composition costs nothing but the manifests. After an
// approval action, for this host: the approvers are told.
onApprovalAction(async (tx, event) =>
  (await import("@/lib/notifications")).emitWorkflowNotificationFromApprovalAction(tx, event),
);

// The search box's arms: one per module with records worth typing at.
registerSearchArm({ id: "crm", run: async (db, input) => (await import("@/lib/crm/search")).searchCrm(db, input) });
registerSearchArm({
  id: "schools",
  run: async (db, input) => {
    const { searchSchools } = await import("@/lib/schools/search");
    return searchSchools(db, { ...input, types: input.types as Parameters<typeof searchSchools>[1]["types"] });
  },
});
registerSearchArm({
  id: "people",
  run: async (db, input) => {
    const { searchPeople } = await import("@/lib/people/search");
    return searchPeople(db, { ...input, types: input.types as Parameters<typeof searchPeople>[1]["types"] });
  },
});
registerSearchArm({
  id: "gold",
  run: async (db, input) => {
    const { searchGold } = await import("@/lib/gold/search");
    return searchGold(db, { ...input, types: input.types as Parameters<typeof searchGold>[1]["types"] });
  },
});
registerSearchArm({
  id: "retail",
  run: async (db, input) => {
    const { searchRetail } = await import("@/lib/retail/search");
    return searchRetail(db, { ...input, types: input.types as Parameters<typeof searchRetail>[1]["types"] });
  },
});
registerSearchArm({
  id: "operations",
  run: async (db, input) => {
    const { searchOperations } = await import("@/lib/operations/search");
    return searchOperations(db, { ...input, types: input.types as Parameters<typeof searchOperations>[1]["types"] });
  },
});
