/**
 * What this host composes.
 *
 * The manifests of every module this host runs, handed to the kernel's
 * registry. Data only — nothing here reaches a database — so the file is
 * imported wherever the registries are read: at boot on the server
 * (`modules.ts`), by the providers in the browser (`app-providers.tsx`), and
 * by the proxy on the edge. `lib/host/manifests.test.ts` keeps it that way.
 */
import { registerModules, unmetModuleRequirements } from "@corelithzw/platform/manifest";
import { manifest as notifications } from "@corelithzw/module-notifications";
import { manifest as documents } from "@corelithzw/module-documents";
import { manifest as records } from "@corelithzw/module-records";
import { manifest as workflow } from "@corelithzw/module-workflow";
import { manifest as books } from "@/lib/accounting/manifest";
import { manifest as compliance } from "@/lib/compliance/manifest";
import { manifest as crm } from "@/lib/crm/manifest";
import { manifest as gold } from "@/lib/gold/manifest";
import { manifest as maintenance } from "@/lib/maintenance/manifest";
import { manifest as people } from "@/lib/people/manifest";
import { manifest as schools } from "@/lib/schools/manifest";

registerModules([workflow, notifications, records, documents, books, crm, schools, people, gold, compliance, maintenance]);

const unmet = unmetModuleRequirements();
if (unmet.length > 0) {
  throw new Error(
    `This host composes modules that require others it does not compose: ${unmet
      .map((entry) => `${entry.module} requires ${entry.requires}`)
      .join("; ")}.`,
  );
}
