import type { ModuleManifest } from "@corelithzw/platform/manifest";
import { CRM_CAPABILITY_SET } from "./capabilities";

/**
 * The CRM's manifest, ahead of its move.
 *
 * What the CRM contributes to the kernel is declared here now, so the host
 * composes itself by manifests from today and the move to
 * `packages/modules/crm` is a relocation of this file, not a change to it.
 * Data only: nothing here reaches a database.
 */
export const manifest: ModuleManifest = {
  id: "crm",
  permissions: { capabilities: CRM_CAPABILITY_SET },
  records: {
    types: [
      {
        type: "PERSON",
        label: "Person",
        labelPlural: "People",
        kind: "person",
        isPerson: true,
        indexHref: "/crm/people",
        href: "/crm/people/{id}",
        apiPath: "/api/v2/crm/people/{id}",
        queryKey: [
          "crm",
          "person",
          "{id}",
        ],
      },
      {
        type: "COMPANY",
        label: "Company",
        labelPlural: "Companies",
        kind: "company",
        isPerson: false,
        indexHref: "/crm/companies",
        href: "/crm/companies/{id}",
        apiPath: "/api/v2/crm/companies/{id}",
        queryKey: [
          "crm",
          "company",
          "{id}",
        ],
      },
      {
        type: "LEAD",
        label: "Lead",
        labelPlural: "Leads",
        kind: "lead",
        isPerson: false,
        indexHref: "/crm/leads",
        href: "/crm/leads/{id}",
        apiPath: "/api/v2/crm/leads/{id}",
        queryKey: [
          "crm",
          "lead",
          "{id}",
        ],
      },
      {
        type: "DEAL",
        label: "Deal",
        labelPlural: "Deals",
        kind: "deal",
        isPerson: false,
        indexHref: "/crm/deals",
        href: "/crm/deals/{id}",
        apiPath: "/api/v2/crm/deals/{id}",
        queryKey: [
          "crm",
          "deal",
          "{id}",
        ],
      },
      {
        type: "SITE",
        label: "Site",
        labelPlural: "Sites",
        kind: "site",
        isPerson: false,
        indexHref: "/crm/sites",
        href: "/crm/sites/{id}",
        apiPath: "/api/v2/crm/sites/{id}",
        queryKey: [
          "crm",
          "site",
          "{id}",
        ],
      },
      {
        type: "REP",
        label: "Staff member",
        labelPlural: "Staff",
        kind: "rep",
        isPerson: true,
        indexHref: "/crm/reps",
        href: "/crm/reps/{id}",
        apiPath: "/api/v2/crm/reps/{id}",
        queryKey: [
          "crm",
          "rep",
          "{id}",
        ],
      },
    ],
  },
};
