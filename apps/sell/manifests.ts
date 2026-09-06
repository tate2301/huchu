/**
 * What the Sell host composes.
 *
 * The manifests of the modules this host runs, handed to the kernel's
 * registry. Data only — nothing here reaches a database — so the file is
 * imported wherever the registries are read: at boot on the server
 * (`modules.ts`), by the providers in the browser (`app-providers.tsx`), and
 * by the proxy on the edge. `lib/host/manifests.test.ts` keeps it that way.
 */
import { registerModules, unmetModuleRequirements } from "@corelithzw/platform/manifest";
import { registerManagementNavigation } from "@corelithzw/shell/management";
import { registerNavigationSections } from "@corelithzw/shell/navigation";
import { navSections } from "@/lib/navigation";
import { areaLabels, areaNavItems, managementModuleItems } from "@/lib/settings/management-nav";
import { manifest as workflow } from "@corelithzw/module-workflow/manifest";
import { manifest as notifications } from "@corelithzw/module-notifications/manifest";
import { manifest as offline } from "@corelithzw/module-offline/manifest";
import { manifest as records } from "@corelithzw/module-records/manifest";
import { manifest as documents } from "@corelithzw/module-documents/manifest";
import { manifest as books } from "@corelithzw/module-books/manifest";
import { manifest as people } from "@corelithzw/module-people/manifest";
import { manifest as stock } from "@corelithzw/module-stock/manifest";
import { manifest as maintenance } from "@corelithzw/module-maintenance/manifest";
import { manifest as compliance } from "@corelithzw/module-compliance/manifest";
import { manifest as retail } from "@corelithzw/module-sell/manifest";

registerModules([workflow, notifications, offline, records, documents, books, people, stock, maintenance, compliance, retail]);

// The navigation model is data the host owns; the chrome reads it here.
registerNavigationSections(navSections);
registerManagementNavigation({ modules: managementModuleItems, areas: areaNavItems, labels: areaLabels });

const unmet = unmetModuleRequirements();
if (unmet.length > 0) {
  throw new Error(
    `This host composes modules that require others it does not compose: ${unmet
      .map((entry) => `${entry.module} requires ${entry.requires}`)
      .join("; ")}.`,
  );
}
