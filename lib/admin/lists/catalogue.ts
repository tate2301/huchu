import { catalogueBundleRows, catalogueFeatureRows } from "@/lib/admin/catalogue";
import { CLIENT_BUNDLE_TEMPLATES } from "@/lib/platform/client-templates";
import { FEATURE_BUNDLES, FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import { VERTICAL_ORDER, VERTICALS } from "@/lib/platform/verticals";
import type { ListGrant, ListSpec, ReportRow } from "@/lib/reports/types";

import type { AdminListSource } from "./engine";

/**
 * The Catalogue: every feature, bundle and template. Every operator reads it;
 * only owners change it, and only what was made here — the code decides the
 * rest (`lib/platform/feature-catalog.ts`).
 */

export const CATALOGUE_READ: ListGrant[] = [["admin", "workspace.export"], ["admin", "billing.manage"], ["admin", "member.signInAs"]];
const OWNER: ListGrant[] = [["admin", "operator.manage"]];

const DOMAINS = [...new Set(FEATURE_CATALOG.map((feature) => feature.domain))].sort();
const domainWord = (domain: string) => (domain === "hr" ? "HR" : domain === "crm" ? "CRM" : domain[0]!.toUpperCase() + domain.slice(1));
const yes = (value: boolean) => (value ? "Yes" : "No");

// ── Features ─────────────────────────────────────────────────────────

export const CATALOGUE_FEATURES_LIST: ListSpec = {
  noun: "features",
  read: CATALOGUE_READ,
  search: { placeholder: "Feature or key", keys: ["name", "key"] },
  tabs: [
    { key: "active", label: "Active", where: [{ column: "active", op: "is", value: ["Yes"] }] },
    { key: "inactive", label: "Inactive", where: [{ column: "active", op: "is", value: ["No"] }] },
  ],
  filters: [
    {
      key: "domain",
      label: "Area",
      type: "choice",
      any: "Any area",
      column: "domain",
      primary: true,
      options: DOMAINS.map((domain) => ({ value: domain, label: domainWord(domain) })),
    },
    {
      key: "from",
      label: "Defined",
      type: "choice",
      any: "Anywhere",
      column: "from",
      primary: true,
      options: [
        { value: "Code", label: "In code" },
        { value: "Here", label: "Here" },
      ],
    },
  ],
  sorts: [
    { key: "domain", label: "By area", rules: [{ column: "domain", dir: "asc" }, { column: "name", dir: "asc" }] },
    { key: "used", label: "Most used first", rules: [{ column: "workspaces", dir: "desc" }, { column: "name", dir: "asc" }] },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
  ],
  groups: ["domainWord", "from"],
  columns: [
    { key: "name", label: "Feature", kind: "text", cell: "text", strong: true, sortable: true, width: "minmax(170px,1.1fr)", align: "start", priority: 1 },
    { key: "key", label: "Key", kind: "code", cell: "mono", width: "minmax(200px,1fr)", align: "start", priority: 2 },
    { key: "domainWord", label: "Area", kind: "text", cell: "muted", width: "110px", align: "start", priority: 2 },
    { key: "defaultOn", label: "On by default", kind: "text", cell: "muted", width: "120px", align: "start", priority: 3 },
    { key: "from", label: "Defined", kind: "text", cell: "muted", width: "90px", align: "start", priority: 3 },
    { key: "workspaces", label: "Workspaces on", kind: "number", cell: "num", sortable: true, width: "130px", align: "end", priority: 1 },
  ],
  rowHref: "",
  rowMenu: [
    {
      key: "edit",
      label: "Edit…",
      requires: OWNER,
      when: [{ column: "from", op: "is", value: ["Here"] }],
      do: { sheet: "catalogue-feature" },
    },
    {
      key: "inactive",
      label: "Mark inactive…",
      requires: OWNER,
      separated: true,
      when: [
        { column: "from", op: "is", value: ["Here"] },
        { column: "active", op: "is", value: ["Yes"] },
      ],
      do: { run: "catalogue-features-inactive", endpoint: "/api/platform-admin/catalogue/features/inactive" },
    },
    {
      key: "active",
      label: "Mark active",
      requires: OWNER,
      when: [
        { column: "from", op: "is", value: ["Here"] },
        { column: "active", op: "is", value: ["No"] },
      ],
      do: { run: "catalogue-features-active", endpoint: "/api/platform-admin/catalogue/features/active" },
    },
  ],
  bulk: [
    {
      key: "inactive",
      label: "Mark inactive",
      requires: OWNER,
      tabs: ["active"],
      when: [{ column: "from", op: "is", value: ["Here"] }],
      do: { run: "catalogue-features-inactive", endpoint: "/api/platform-admin/catalogue/features/inactive" },
    },
    {
      key: "active",
      label: "Mark active",
      requires: OWNER,
      tabs: ["inactive"],
      when: [{ column: "from", op: "is", value: ["Here"] }],
      do: { run: "catalogue-features-active", endpoint: "/api/platform-admin/catalogue/features/active" },
    },
    { key: "export" },
  ],
  card: { title: "name", figure: "workspaces", meta: "{key}", metaMono: ["key"] },
  empty: { icon: "Stack", title: "The catalogue is empty", line: "Sync it from code to write every feature and bundle into the database." },
};

export const catalogueFeaturesSource: AdminListSource = {
  key: "admin-catalogue-features",
  title: "Features",
  list: CATALOGUE_FEATURES_LIST,
  async load() {
    return (await catalogueFeatureRows()).map(
      (row): ReportRow => ({
        id: row.key,
        name: row.name,
        key: row.key,
        domain: row.domain,
        domainWord: row.domain ? domainWord(row.domain) : null,
        defaultOn: yes(row.defaultEnabled),
        from: row.inCode ? "Code" : "Here",
        active: yes(row.isActive),
        workspaces: row.workspaces,
      }),
    );
  },
};

// ── Bundles ──────────────────────────────────────────────────────────

const OWN_BUNDLE = { column: "from", op: "is" as const, value: ["Here"] };

export const CATALOGUE_BUNDLES_LIST: ListSpec = {
  noun: "bundles",
  read: CATALOGUE_READ,
  search: { placeholder: "Bundle or code", keys: ["name", "code"] },
  tabs: [
    { key: "active", label: "In use", where: [{ column: "active", op: "is", value: ["Yes"] }] },
    { key: "retired", label: "Retired", where: [{ column: "active", op: "is", value: ["No"] }] },
  ],
  filters: [
    {
      key: "from",
      label: "Defined",
      type: "choice",
      any: "Anywhere",
      column: "from",
      primary: true,
      options: [
        { value: "Code", label: "In code" },
        { value: "Here", label: "Here" },
      ],
    },
  ],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "used", label: "Most used first", rules: [{ column: "workspaces", dir: "desc" }, { column: "name", dir: "asc" }] },
  ],
  groups: ["from"],
  columns: [
    { key: "name", label: "Bundle", kind: "text", cell: "link", sortable: true, width: "minmax(180px,1.2fr)", align: "start", priority: 1 },
    { key: "code", label: "Code", kind: "code", cell: "mono", width: "minmax(190px,1fr)", align: "start", priority: 2 },
    { key: "features", label: "Features", kind: "number", cell: "num", sortable: true, width: "96px", align: "end", priority: 1 },
    { key: "workspaces", label: "Workspaces", kind: "number", cell: "num", sortable: true, width: "110px", align: "end", priority: 1 },
    { key: "from", label: "Defined", kind: "text", cell: "muted", width: "90px", align: "start", priority: 3 },
  ],
  rowHref: "?sheet=catalogue-bundle&id={code}",
  rowMenu: [
    { key: "open", label: "Features…", requires: CATALOGUE_READ, do: { sheet: "catalogue-bundle" } },
    {
      key: "retire",
      label: "Retire…",
      tone: "bad",
      separated: true,
      requires: OWNER,
      when: [OWN_BUNDLE, { column: "active", op: "is", value: ["Yes"] }],
      do: { run: "catalogue-bundles-retire", endpoint: "/api/platform-admin/catalogue/bundles/retire" },
    },
    {
      key: "restore",
      label: "Bring back",
      requires: OWNER,
      when: [OWN_BUNDLE, { column: "active", op: "is", value: ["No"] }],
      do: { run: "catalogue-bundles-restore", endpoint: "/api/platform-admin/catalogue/bundles/restore" },
    },
  ],
  bulk: [
    {
      key: "retire",
      label: "Retire",
      tone: "bad",
      requires: OWNER,
      tabs: ["active"],
      when: [OWN_BUNDLE],
      do: { run: "catalogue-bundles-retire", endpoint: "/api/platform-admin/catalogue/bundles/retire" },
    },
    {
      key: "restore",
      label: "Bring back",
      requires: OWNER,
      tabs: ["retired"],
      do: { run: "catalogue-bundles-restore", endpoint: "/api/platform-admin/catalogue/bundles/restore" },
    },
    { key: "export" },
  ],
  card: { title: "name", figure: "features", meta: "{code}", metaMono: ["code"] },
  empty: { icon: "Stack", title: "No bundles", line: "Sync the catalogue from code, or make a bundle." },
};

export const catalogueBundlesSource: AdminListSource = {
  key: "admin-catalogue-bundles",
  title: "Bundles",
  list: CATALOGUE_BUNDLES_LIST,
  async load() {
    return (await catalogueBundleRows()).map(
      (row): ReportRow => ({
        id: row.code,
        name: row.name,
        code: row.code,
        features: row.features,
        workspaces: row.workspaces,
        from: row.inCode ? "Code" : "Here",
        active: yes(row.isActive),
      }),
    );
  },
};

// ── Templates ────────────────────────────────────────────────────────

export const CATALOGUE_TEMPLATES_LIST: ListSpec = {
  noun: "templates",
  read: CATALOGUE_READ,
  search: { placeholder: "Template, code or vertical", keys: ["name", "code", "vertical"] },
  filters: [],
  sorts: [{ key: "vertical", label: "By vertical", rules: [{ column: "order", dir: "asc" }, { column: "name", dir: "asc" }] }],
  columns: [
    { key: "name", label: "Template", kind: "text", cell: "text", strong: true, width: "minmax(180px,1.1fr)", align: "start", priority: 1 },
    { key: "code", label: "Code", kind: "code", cell: "mono", width: "minmax(200px,1fr)", align: "start", priority: 3 },
    { key: "vertical", label: "Vertical", kind: "text", cell: "text", width: "minmax(140px,0.8fr)", align: "start", priority: 1 },
    { key: "bundles", label: "Bundles", kind: "text", cell: "muted", width: "minmax(220px,1.6fr)", align: "start", priority: 2 },
    { key: "keptOut", label: "Kept out", kind: "number", cell: "num", width: "96px", align: "end", priority: 2 },
  ],
  rowHref: "",
  card: { title: "name", figure: "keptOut", meta: "{vertical}", meta2: "{bundles}" },
  empty: { icon: "Stack", title: "No templates", line: "Templates are defined in code, in client-templates.ts." },
};

export const catalogueTemplatesSource: AdminListSource = {
  key: "admin-catalogue-templates",
  title: "Templates",
  list: CATALOGUE_TEMPLATES_LIST,
  async load() {
    const bundleName = new Map(FEATURE_BUNDLES.map((bundle) => [bundle.code, bundle.name]));
    return CLIENT_BUNDLE_TEMPLATES.map((template): ReportRow => {
      const vertical = VERTICAL_ORDER.find((candidate) => VERTICALS[candidate].templateCode === template.code);
      return {
        id: template.code,
        name: template.label,
        code: template.code,
        vertical: vertical ? VERTICALS[vertical].label : null,
        order: vertical ? VERTICAL_ORDER.indexOf(vertical) : VERTICAL_ORDER.length,
        bundles: template.bundleCodes.map((code) => bundleName.get(code) ?? code).join(", "),
        keptOut: template.disabledFeatureKeys?.length ?? 0,
      };
    });
  },
};
