"use client";

import { useSearchParams } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { CrmSettingsContent, CRM_SETTINGS_SECTIONS } from "@/components/crm/crm-settings-content";

/**
 * The band names the section you are in, not the module you are in.
 *
 * The artboards title a setup page "Pipelines" with that section's own lede,
 * and the reason is that the band is the only permanent label on the page: the
 * rail highlight scrolls away with the rail on a narrow window, and "CRM setup"
 * is already what the sidebar entry you clicked says. Repeating it in the band
 * spends the one line that never scrolls on information the reader used to get
 * here.
 *
 * This exists as a wrapper because the band belongs to `CrmPage`, which sits
 * above the content — and the active section lives in the query string, which
 * only a client component can read. The route itself stays a server component
 * so the session check happens before any of this renders.
 */
export function CrmSettingsShell() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active =
    CRM_SETTINGS_SECTIONS.find((section) => section.id === requested) ??
    CRM_SETTINGS_SECTIONS[0];

  return (
    <CrmPage title={active.label} description={active.description}>
      <CrmSettingsContent />
    </CrmPage>
  );
}
