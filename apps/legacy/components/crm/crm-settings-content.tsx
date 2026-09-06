"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@corelithzw/platform/api-client";
import { Coins, Dataset, Funnel, Lock, Megaphone, Package, type LucideIcon } from "@corelithzw/ui/lib/icons";
import { NavRail, NavRailItem } from "@corelithzw/ui/components/nav-rail";
import { CataloguePanel } from "@corelithzw/module-stock/components/catalogue-panel";
import { ApiKeysPanel } from "@/components/crm/settings/api-keys-panel";
import { CommissionsPanel } from "@/components/crm/settings/commissions-panel";
import { CustomFieldsPanel } from "@/components/crm/settings/custom-fields-panel";
import { LeadSourcesPanel } from "@/components/crm/settings/lead-sources-panel";
import { PipelinesPanel } from "@/components/crm/settings/pipelines-panel";

/**
 * CRM settings, on the settings shell rather than a tab strip.
 *
 * Eight tabs in a scrolling strip is the shape the pattern exists to replace:
 * the rail is the map and the content is one page deep, so you can see every
 * section at once instead of discovering them by scrolling sideways. The
 * active section lives in the URL, so a link to Pipelines opens Pipelines.
 *
 * Each panel saves inline. There is deliberately no sticky unsaved bar —
 * settings are individually committed, not a form you submit — which is what
 * the band's "saves as you go" says, in the one place it cannot be missed.
 */

/** What each panel needs to open its own create flow from the page band. */
export type SettingsPanelProps = {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
};

export type SetupCounts = {
  pipelines: number;
  fields: number;
  sources: number;
  catalogue: number;
  commissions: number;
  keys: number;
};

type SettingsSection = {
  id: string;
  label: string;
  description: string;
  /** The band's primary action for this section — "New pipeline", "Add field". */
  addLabel: string;
  icon: LucideIcon;
  /** Which key in the counts response tallies this section. */
  countKey: keyof SetupCounts;
  render: (props: SettingsPanelProps) => ReactNode;
};

/**
 * The six setup sections.
 *
 * Exported because the page band names the active one and carries its action —
 * see `CrmSettingsShell`. The descriptions are the band ledes, which is why
 * they are written as sentence fragments rather than headings: the band reads
 * "Pipelines · the stages a deal moves through", one line, and nothing below
 * repeats either half of it.
 */
export const CRM_SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "pipelines",
    label: "Pipelines",
    icon: Funnel,
    countKey: "pipelines",
    addLabel: "New pipeline",
    description: "the stages a deal moves through, and what each one requires",
    render: (props) => <PipelinesPanel {...props} />,
  },
  {
    id: "fields",
    label: "Custom fields",
    icon: Dataset,
    countKey: "fields",
    addLabel: "Add field",
    description: "extra fields for your business, on the form and the record page",
    render: (props) => <CustomFieldsPanel {...props} />,
  },
  {
    id: "sources",
    label: "Lead sources",
    icon: Megaphone,
    countKey: "sources",
    addLabel: "Add source",
    description: "where enquiries come from, so attribution has something to count",
    render: (props) => <LeadSourcesPanel {...props} />,
  },
  {
    id: "catalogue",
    label: "Catalogue",
    icon: Package,
    countKey: "catalogue",
    addLabel: "Add item",
    description: "what the business sells — shared with Stock & Inventory and Retail",
    render: (props) => <CataloguePanel {...props} />,
  },
  {
    id: "commissions",
    label: "Commissions",
    icon: Coins,
    countKey: "commissions",
    addLabel: "Create rule",
    description: "who earns what, and at which thresholds",
    render: (props) => <CommissionsPanel {...props} />,
  },
  {
    id: "keys",
    label: "API keys",
    icon: Lock,
    countKey: "keys",
    addLabel: "Create key",
    description: "credentials for webhook and intake-form integrations",
    render: (props) => <ApiKeysPanel {...props} />,
  },
];

/** Which section the query string is asking for, falling back to the first. */
export function useActiveSettingsSection() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  return (
    CRM_SETTINGS_SECTIONS.find((section) => section.id === requested) ?? CRM_SETTINGS_SECTIONS[0]
  );
}

export function CrmSettingsContent({ createOpen, onCreateOpenChange }: SettingsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = useActiveSettingsSection();

  /*
    How much is in each section, for the rail.

    The artboard's rail is not only navigation — every entry carries a tally, so
    a workspace that has never configured custom fields can see that from the
    rail rather than by opening the section and finding it empty. One request
    for all six; see app/api/v2/crm/settings/counts/route.ts.
  */
  const counts = useQuery({
    queryKey: ["crm-setup-counts"],
    queryFn: () =>
      fetchJson<{ data: SetupCounts }>("/api/v2/crm/settings/counts").then((r) => r.data),
  });

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
            // A zero is a real answer here — "nothing set up yet" — but it is
            // only worth drawing once the counts have actually arrived.
            count={counts.data ? counts.data[section.countKey] : undefined}
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
      <section className="min-w-0">{active.render({ createOpen, onCreateOpenChange })}</section>
    </div>
  );
}
