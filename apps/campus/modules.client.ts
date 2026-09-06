/**
 * How this host is wired in the browser.
 *
 * What the offline runtime warms and syncs is data with sync adapters in it —
 * code, so it is not a manifest, and it runs in the browser, so `modules.ts`
 * (server only) cannot register it. Imported by the providers in the browser
 * and by `modules.ts` on the server, so both sides answer the same.
 */
import { registerOfflineModules } from "@corelithzw/module-offline/module-registry";
import { registerOfflineWorkflows } from "@corelithzw/module-offline/workflow-catalog";
import { OFFLINE_MODULES } from "@/lib/host/offline-modules";
import { OFFLINE_EXCLUDED_ROUTE_REASONS, OFFLINE_WORKFLOW_CATALOG } from "@/lib/host/offline-workflows";

registerOfflineModules(OFFLINE_MODULES);
registerOfflineWorkflows(OFFLINE_WORKFLOW_CATALOG, OFFLINE_EXCLUDED_ROUTE_REASONS);
