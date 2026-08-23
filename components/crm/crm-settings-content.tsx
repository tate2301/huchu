"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Coins,
  Dataset,
  Funnel,
  Lock,
  Megaphone,
  Package,
  X,
  type LucideIcon,
} from "@/lib/icons";
import { CRM_CHANNEL_LABELS, CRM_LEAD_CHANNELS } from "@/lib/crm/sources";
import { CustomFieldsPanel } from "@/components/crm/settings/custom-fields-panel";
import { PipelinesPanel } from "@/components/crm/settings/pipelines-panel";
import { NavRail, NavRailItem } from "@/components/ui/nav-rail";
import { CataloguePanel } from "@/components/inventory/catalogue-panel";
import type { CrmLeadChannel } from "@prisma/client";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  defaultChannel: CrmLeadChannel | null;
  defaultSourceLabel: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type LeadSource = { id: string; name: string; channel: CrmLeadChannel; isActive: boolean };
type CommissionRule = {
  id: string;
  name: string;
  basis: "INVOICED" | "PAID";
  isActive: boolean;
  tiers: Array<{ thresholdFrom: number; ratePercent: number }>;
};

function ApiKeysPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [defaultChannel, setDefaultChannel] = useState<string>("");
  const [defaultSourceLabel, setDefaultSourceLabel] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ["crm-api-keys"],
    queryFn: () => fetchJson<{ data: ApiKey[] }>("/api/v2/crm/api-keys").then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () =>
      fetchJson<{ key: string }>("/api/v2/crm/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name,
          defaultChannel: defaultChannel || undefined,
          defaultSourceLabel: defaultSourceLabel || undefined,
        }),
      }),
    onSuccess: (data) => {
      setRevealed(data.key);
      setName("");
      setDefaultChannel("");
      setDefaultSourceLabel("");
      queryClient.invalidateQueries({ queryKey: ["crm-api-keys"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/crm/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-api-keys"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook API keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          POST leads to <code>/api/public/crm/webhook/leads</code> with header <code>x-api-key</code>.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <Input placeholder="Key name (e.g. Facebook Lead Ads)" value={name} onChange={(e) => setName(e.target.value)} />
          <select
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            value={defaultChannel}
            onChange={(e) => setDefaultChannel(e.target.value)}
          >
            <option value="">Channel: auto-detect</option>
            {CRM_LEAD_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CRM_CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
          <Input
            placeholder="Source label (e.g. facebook)"
            value={defaultSourceLabel}
            onChange={(e) => setDefaultSourceLabel(e.target.value)}
          />
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
            Create key
          </Button>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Every lead captured with a key inherits its channel and source label — e.g. a &quot;Facebook Lead
          Ads&quot; key labels leads as Paid ads / facebook automatically.
        </p>
        {revealed ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-hover)] p-3">
            <p className="text-sm font-medium">Copy this key now — it won&apos;t be shown again:</p>
            <code className="mt-1 block break-all text-sm">{revealed}</code>
          </div>
        ) : null}
        <ul className="divide-y divide-[var(--border)]">
          {(keys.data ?? []).map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 break-all">
                {k.name} <code className="text-[var(--text-muted)]">{k.keyPrefix}…</code>
                {k.revokedAt ? <Badge variant="outline" className="ml-2">Revoked</Badge> : null}
              </span>
              {!k.revokedAt ? (
                <Button size="sm" variant="outline" onClick={() => revoke.mutate(k.id)}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function LeadSourcesPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<string>("OTHER");
  const [error, setError] = useState<string | null>(null);

  const sources = useQuery({
    queryKey: ["crm-lead-sources"],
    queryFn: () => fetchJson<{ data: LeadSource[] }>("/api/v2/crm/lead-sources").then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/lead-sources", {
        method: "POST",
        body: JSON.stringify({ name, channel }),
      }),
    onSuccess: () => {
      setName("");
      setChannel("OTHER");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["crm-lead-sources"] });
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; channel?: string; isActive?: boolean }) =>
      fetchJson(`/api/v2/crm/lead-sources/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ channel: input.channel, isActive: input.isActive }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["crm-lead-sources"] });
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          The catalog of places leads come from — walk-ins, referrals, ad platforms, social pages. Each
          source maps to a channel so insights can compare rep-entered leads against ads and social
          traffic. Sources appear as suggestions when reps log a lead.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Input
            placeholder="Source name (e.g. Facebook, Walk-in)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            {CRM_LEAD_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {CRM_CHANNEL_LABELS[value]}
              </option>
            ))}
          </select>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            Add source
          </Button>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ul className="divide-y divide-[var(--border)]">
          {(sources.data ?? []).map((source) => (
            <li key={source.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className={source.isActive ? "font-medium" : "text-[var(--text-muted)] line-through"}>
                {source.name}
              </span>
              <span className="flex items-center gap-2">
                <select
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-2 py-1 text-sm"
                  value={source.channel}
                  disabled={update.isPending}
                  onChange={(e) => update.mutate({ id: source.id, channel: e.target.value })}
                >
                  {CRM_LEAD_CHANNELS.map((value) => (
                    <option key={value} value={value}>
                      {CRM_CHANNEL_LABELS[value]}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: source.id, isActive: !source.isActive })}
                >
                  {source.isActive ? "Deactivate" : "Reactivate"}
                </Button>
              </span>
            </li>
          ))}
          {sources.data && sources.data.length === 0 ? (
            <li className="py-2 text-sm text-[var(--text-muted)]">
              No sources yet. Leads from webhooks and intake forms still get a channel automatically.
            </li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function CommissionsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [basis, setBasis] = useState<"INVOICED" | "PAID">("PAID");
  const [tiers, setTiers] = useState([{ thresholdFrom: "0", ratePercent: "5" }]);
  const [error, setError] = useState<string | null>(null);

  const rules = useQuery({
    queryKey: ["crm-commission-rules"],
    queryFn: () => fetchJson<{ data: CommissionRule[] }>("/api/v2/crm/commissions/rules").then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/commissions/rules", {
        method: "POST",
        body: JSON.stringify({
          name,
          basis,
          tiers: tiers.map((t) => ({ thresholdFrom: Number(t.thresholdFrom), ratePercent: Number(t.ratePercent) })),
        }),
      }),
    onSuccess: () => {
      setName("");
      setTiers([{ thresholdFrom: "0", ratePercent: "5" }]);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["crm-commission-rules"] });
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Commission rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="rule-name">Rule name</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rule-basis">Basis</Label>
            <select
              id="rule-basis"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2"
              value={basis}
              onChange={(e) => setBasis(e.target.value as "INVOICED" | "PAID")}
            >
              <option value="PAID">On payment received</option>
              <option value="INVOICED">On invoiced amount</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Tiers (marginal rate from a cumulative revenue threshold)</Label>
          {tiers.map((tier, index) => (
            // Two fields and a delete, sized by content rather than by
            // twelfths: one twelfth of a 390px phone is a 22px delete button,
            // which is half a touch target.
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                type="number"
                placeholder="From revenue"
                value={tier.thresholdFrom}
                onChange={(e) => {
                  const next = [...tiers];
                  next[index] = { ...tier, thresholdFrom: e.target.value };
                  setTiers(next);
                }}
              />
              <Input
                type="number"
                placeholder="Rate %"
                value={tier.ratePercent}
                onChange={(e) => {
                  const next = [...tiers];
                  next[index] = { ...tier, ratePercent: e.target.value };
                  setTiers(next);
                }}
              />
              <Button
                className="size-9 px-0"
                variant="ghost"
                size="sm"
                aria-label={`Remove tier ${index + 1}`}
                onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTiers([...tiers, { thresholdFrom: "0", ratePercent: "0" }])}
          >
            Add tier
          </Button>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
          Create rule
        </Button>

        <ul className="divide-y divide-[var(--border)]">
          {(rules.data ?? []).map((rule) => (
            <li key={rule.id} className="py-2 text-sm">
              <span className="font-medium">{rule.name}</span>{" "}
              <Badge variant="outline">{rule.basis === "PAID" ? "On payment" : "On invoice"}</Badge>
              <span className="ml-2 text-[var(--text-muted)]">
                {rule.tiers.map((t) => `${t.ratePercent}% from ${t.thresholdFrom}`).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * CRM settings, on the settings shell rather than a tab strip.
 *
 * Eight tabs in a scrolling strip is the shape the pattern exists to replace:
 * the rail is the map and the content is one page deep, so you can see every
 * section at once instead of discovering them by scrolling sideways. The
 * active section lives in the URL, so a link to Pipelines opens Pipelines.
 *
 * Each panel saves inline. There is deliberately no sticky unsaved bar —
 * settings are individually committed, not a form you submit.
 */

type SettingsSection = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  render: () => ReactNode;
};

/**
 * The six setup sections.
 *
 * Exported because the page band names the active one — see `CrmSettingsShell`.
 * The descriptions are the band ledes, which is why they are written as
 * sentence fragments rather than headings.
 */
export const CRM_SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "pipelines",
    label: "Pipelines",
    icon: Funnel,
    description: "The stages a deal moves through, and what each one requires.",
    render: () => <PipelinesPanel />,
  },
  {
    id: "fields",
    label: "Custom fields",
    icon: Dataset,
    description: "Extra fields for your business, on the form and the record page.",
    render: () => <CustomFieldsPanel />,
  },
  {
    id: "sources",
    label: "Lead sources",
    icon: Megaphone,
    description: "Where enquiries come from, so attribution has something to count.",
    render: () => <LeadSourcesPanel />,
  },
  {
    id: "catalogue",
    label: "Catalogue",
    icon: Package,
    description: "What the business sells — shared with Stock & Inventory and Retail.",
    render: () => <CataloguePanel />,
  },
  {
    id: "commissions",
    label: "Commissions",
    icon: Coins,
    description: "Who earns what, and at which thresholds.",
    render: () => <CommissionsPanel />,
  },
  {
    id: "keys",
    label: "API keys",
    icon: Lock,
    description: "Credentials for webhook and intake-form integrations.",
    render: () => <ApiKeysPanel />,
  },
];

export function CrmSettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active = CRM_SETTINGS_SECTIONS.find((section) => section.id === requested) ?? CRM_SETTINGS_SECTIONS[0];

  const select = (id: string) => {
    // Replace rather than push: flipping between settings sections is not
    // navigation you want to walk back through one at a time.
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="settings-layout">
      <NavRail label="CRM settings sections" orientation="responsive">
        {CRM_SETTINGS_SECTIONS.map((section) => (
          <NavRailItem
            key={section.id}
            active={section.id === active.id}
            icon={<section.icon className="size-4" aria-hidden="true" />}
            onClick={() => select(section.id)}
          >
            {section.label}
          </NavRailItem>
        ))}
      </NavRail>

      {/* No heading here.

          The band directly above already carries this section's name and its
          lede — see `CrmSettingsShell`. A second copy three lines lower is the
          same duplication the accounting pages had between the app bar and the
          page title, and it pushed the first actual control below the fold on
          a laptop. */}
      <section className="min-w-0 space-y-3">{active.render()}</section>
    </div>
  );
}
