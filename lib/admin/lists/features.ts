import { bundleState, featureFacts, featureRows } from "@/lib/admin/features";
import { getClientTemplateDefinition } from "@/lib/platform/client-templates";
import { BUNDLE_DEPENDENCIES, FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import { VERTICALS } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";
import type { ListGrant, ListSpec, ReportRow } from "@/lib/reports/types";
import { dayKey } from "@/lib/workspace/format";

import type { AdminListSource } from "./engine";

/**
 * A workspace's Verticals and features page: its verticals, its bundles, and
 * every feature with where its state comes from. Each list is scoped to the
 * workspace by the `w` parent filter, its slug.
 */

export const FEATURES_READ: ListGrant[] = [["admin", "workspace.export"], ["admin", "billing.manage"], ["admin", "member.signInAs"]];
const EDIT: ListGrant[] = [["admin", "workspace.edit"]];

const PARENT = { key: "w", type: "parent" as const, column: "w" };

async function workspaceOf(filters: Record<string, string>) {
  const slug = filters.w;
  if (!slug) return null;
  return prisma.company.findUnique({ where: { slug }, select: { id: true, slug: true } });
}

// ── Verticals ────────────────────────────────────────────────────────

export const WORKSPACE_VERTICALS_LIST: ListSpec = {
  noun: "verticals",
  read: FEATURES_READ,
  search: { placeholder: "Vertical", keys: ["name"] },
  filters: [PARENT],
  sorts: [{ key: "added", label: "First added first", rules: [{ column: "added", dir: "asc" }] }],
  columns: [
    { key: "name", label: "Vertical", kind: "text", cell: "text", strong: true, width: "minmax(180px,1.2fr)", align: "start", priority: 1 },
    { key: "template", label: "Built from", kind: "text", cell: "muted", width: "minmax(160px,1fr)", align: "start", priority: 2 },
    { key: "bundles", label: "Bundles", kind: "number", cell: "num", width: "88px", align: "end", priority: 2 },
    { key: "added", label: "Added", kind: "date", cell: "date", dayFormat: "medium", width: "120px", align: "start", priority: 2 },
  ],
  rowHref: "",
  rowMenu: [
    {
      key: "remove",
      label: "Remove…",
      tone: "bad",
      requires: EDIT,
      do: { run: "verticals-remove", endpoint: "/api/platform-admin/features/{w}/verticals/remove" },
    },
  ],
  card: { title: "name", figure: "bundles", meta: "{template}" },
  empty: { icon: "Stack", title: "No verticals", line: "Add a vertical to turn its features on. A workspace pays for each one." },
};

export const workspaceVerticalsSource: AdminListSource = {
  key: "admin-workspace-verticals",
  title: "Verticals",
  list: WORKSPACE_VERTICALS_LIST,
  async load(filters) {
    const workspace = await workspaceOf(filters);
    if (!workspace) return [];
    const rows = await prisma.companyVertical.findMany({ where: { companyId: workspace.id }, orderBy: { addedAt: "asc" } });
    return rows.map((row): ReportRow => {
      const template = getClientTemplateDefinition(VERTICALS[row.vertical].templateCode);
      return {
        id: row.vertical,
        w: workspace.slug,
        name: VERTICALS[row.vertical].label,
        template: template?.label ?? null,
        bundles: template?.bundleCodes.length ?? 0,
        added: dayKey(row.addedAt),
      };
    });
  },
};

// ── Bundles ──────────────────────────────────────────────────────────

const BUNDLE_TONES = { Included: "ok", On: "info", Off: "neutral" } as const;

export const WORKSPACE_BUNDLES_LIST: ListSpec = {
  noun: "bundles",
  read: FEATURES_READ,
  search: { placeholder: "Bundle or code", keys: ["name", "code"] },
  filters: [
    PARENT,
    {
      key: "state",
      label: "State",
      type: "choice",
      any: "Any state",
      column: "state",
      primary: true,
      options: [
        { value: "Included", label: "Included" },
        { value: "On", label: "On" },
        { value: "Off", label: "Off" },
      ],
    },
  ],
  sorts: [
    { key: "state", label: "On first", rules: [{ column: "order", dir: "asc" }, { column: "name", dir: "asc" }] },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
  ],
  groups: ["state"],
  columns: [
    { key: "name", label: "Bundle", kind: "text", cell: "text", strong: true, width: "minmax(180px,1.2fr)", align: "start", priority: 1 },
    { key: "code", label: "Code", kind: "code", cell: "mono", width: "minmax(170px,0.9fr)", align: "start", priority: 3 },
    { key: "features", label: "Features", kind: "number", cell: "num", width: "88px", align: "end", priority: 2 },
    { key: "state", label: "State", kind: "status", cell: "state", tones: BUNDLE_TONES, width: "100px", align: "start", priority: 1 },
    { key: "why", label: "Why", kind: "text", cell: "muted", width: "minmax(180px,1.2fr)", align: "start", priority: 2 },
  ],
  rowHref: "",
  rowMenu: [
    {
      key: "on",
      label: "Turn on…",
      requires: EDIT,
      when: [{ column: "state", op: "is", value: ["Off"] }],
      do: { run: "bundles-on", endpoint: "/api/platform-admin/features/{w}/bundles/on" },
    },
    {
      key: "off",
      label: "Turn off…",
      requires: EDIT,
      when: [{ column: "state", op: "is", value: ["On"] }],
      do: { run: "bundles-off", endpoint: "/api/platform-admin/features/{w}/bundles/off" },
    },
  ],
  bulk: [
    {
      key: "on",
      label: "Turn on",
      requires: EDIT,
      when: [{ column: "state", op: "is", value: ["Off"] }],
      do: { run: "bundles-on", endpoint: "/api/platform-admin/features/{w}/bundles/on" },
    },
    {
      key: "off",
      label: "Turn off",
      requires: EDIT,
      when: [{ column: "state", op: "is", value: ["On"] }],
      do: { run: "bundles-off", endpoint: "/api/platform-admin/features/{w}/bundles/off" },
    },
    { key: "export" },
  ],
  card: { title: "name", badge: "state", figure: "features", meta: "{code}", metaMono: ["code"] },
  empty: { icon: "Stack", title: "No bundles", line: "Bundles are made in the Catalogue." },
};

const STATE_ORDER = { Included: 0, On: 1, Off: 2 } as const;

export const workspaceBundlesSource: AdminListSource = {
  key: "admin-workspace-bundles",
  title: "Bundles",
  list: WORKSPACE_BUNDLES_LIST,
  async load(filters) {
    const workspace = await workspaceOf(filters);
    if (!workspace) return [];
    const facts = await featureFacts(workspace.id);
    return facts.bundles
      .filter((bundle) => bundle.isActive || bundleState(facts, bundle.code) !== "Off")
      .map((bundle): ReportRow => {
        const state = bundleState(facts, bundle.code);
        const needs = (BUNDLE_DEPENDENCIES[bundle.code] ?? []).map((code) => facts.bundleByCode.get(code)?.name ?? code);
        const why =
          state === "Included"
            ? `Comes with ${(facts.includedBy.get(bundle.code) ?? []).join(", ")}`
            : needs.length
              ? `Needs ${needs.join(", ")}`
              : (bundle.description ?? null);
        return {
          id: bundle.code,
          w: workspace.slug,
          name: bundle.name,
          code: bundle.code,
          features: bundle.features.length,
          state,
          order: STATE_ORDER[state],
          why,
        };
      });
  },
};

// ── Features ─────────────────────────────────────────────────────────

const DOMAINS = [...new Set(FEATURE_CATALOG.map((feature) => feature.domain))].sort();
const DOMAIN_WORD = (domain: string) => (domain === "hr" ? "HR" : domain === "crm" ? "CRM" : domain[0]!.toUpperCase() + domain.slice(1));

const SOURCES = ["Vertical", "Bundle", "Plan", "Switched on", "Switched off", "Default"] as const;
const SOURCE_TONES = {
  Vertical: "neutral",
  Bundle: "neutral",
  Plan: "neutral",
  "Switched on": "info",
  "Switched off": "warn",
  Default: "neutral",
} as const;

export const WORKSPACE_FEATURES_LIST: ListSpec = {
  noun: "features",
  read: FEATURES_READ,
  search: { placeholder: "Feature or key", keys: ["name", "key"] },
  tabs: [
    { key: "on", label: "On", where: [{ column: "state", op: "is", value: ["On"] }] },
    { key: "off", label: "Off", where: [{ column: "state", op: "is", value: ["Off"] }] },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    PARENT,
    {
      key: "domain",
      label: "Area",
      type: "choice",
      any: "Any area",
      column: "domain",
      primary: true,
      options: DOMAINS.map((domain) => ({ value: domain, label: DOMAIN_WORD(domain) })),
    },
    {
      key: "source",
      label: "Where from",
      type: "choice",
      any: "Anywhere",
      column: "source",
      primary: true,
      options: SOURCES.map((source) => ({ value: source, label: source })),
    },
  ],
  sorts: [
    { key: "domain", label: "By area", rules: [{ column: "domain", dir: "asc" }, { column: "name", dir: "asc" }] },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "key", label: "Key A–Z", rules: [{ column: "key", dir: "asc" }] },
  ],
  groups: ["domain", "source"],
  columns: [
    { key: "name", label: "Feature", kind: "text", cell: "text", strong: true, sortable: true, width: "minmax(170px,1.1fr)", align: "start", priority: 1 },
    { key: "key", label: "Key", kind: "code", cell: "mono", sortable: true, width: "minmax(190px,1fr)", align: "start", priority: 2 },
    { key: "domainWord", label: "Area", kind: "text", cell: "muted", width: "110px", align: "start", priority: 3 },
    { key: "source", label: "Where from", kind: "status", cell: "dot", tones: SOURCE_TONES, width: "130px", align: "start", priority: 2 },
    { key: "state", label: "State", kind: "status", cell: "state", tones: { On: "ok", Off: "neutral" }, width: "80px", align: "start", priority: 1 },
    { key: "reason", label: "Why", kind: "text", cell: "muted", width: "minmax(200px,1.4fr)", align: "start", priority: 2 },
  ],
  rowHref: "",
  rowMenu: [
    {
      key: "on",
      label: "Switch on",
      requires: EDIT,
      when: [{ column: "state", op: "is", value: ["Off"] }],
      do: { run: "features-on", endpoint: "/api/platform-admin/features/{w}/on" },
    },
    {
      key: "off",
      label: "Switch off…",
      requires: EDIT,
      when: [{ column: "state", op: "is", value: ["On"] }],
      do: { run: "features-off", endpoint: "/api/platform-admin/features/{w}/off" },
    },
    {
      key: "reset",
      label: "Back to what its verticals say…",
      requires: EDIT,
      separated: true,
      when: [{ column: "switched", op: "is", value: ["Yes"] }],
      do: { run: "features-reset", endpoint: "/api/platform-admin/features/{w}/reset" },
    },
  ],
  bulk: [
    {
      key: "on",
      label: "Switch on",
      requires: EDIT,
      // Offered while every ticked feature is off, as the bundles' Turn on is.
      when: [{ column: "state", op: "is", value: ["Off"] }],
      do: { run: "features-on", endpoint: "/api/platform-admin/features/{w}/on" },
    },
    {
      key: "off",
      label: "Switch off",
      requires: EDIT,
      when: [{ column: "state", op: "is", value: ["On"] }],
      do: { run: "features-off", endpoint: "/api/platform-admin/features/{w}/off" },
    },
    {
      key: "reset",
      label: "Back to what its verticals say",
      requires: EDIT,
      more: true,
      when: [{ column: "switched", op: "is", value: ["Yes"] }],
      do: { run: "features-reset", endpoint: "/api/platform-admin/features/{w}/reset" },
    },
    { key: "export" },
  ],
  card: { title: "name", badge: "state", figure: "source", meta: "{key}", metaMono: ["key"], meta2: "{reason}" },
  empty: { icon: "ToggleRight", title: "No features", line: "The catalogue has no features yet. Sync it from code in the Catalogue." },
};

export const workspaceFeaturesSource: AdminListSource = {
  key: "admin-workspace-features",
  title: "Features",
  list: WORKSPACE_FEATURES_LIST,
  async load(filters) {
    const workspace = await workspaceOf(filters);
    if (!workspace) return [];
    return featureRows(await featureFacts(workspace.id)).map(
      (feature): ReportRow => ({
        id: feature.key,
        w: workspace.slug,
        name: feature.name,
        key: feature.key,
        domain: feature.domain,
        domainWord: feature.domain ? DOMAIN_WORD(feature.domain) : null,
        source: feature.source,
        state: feature.on ? "On" : "Off",
        switched: feature.switched ? "Yes" : "No",
        reason: feature.reason,
      }),
    );
  },
};
