"use client";

import { useQuery } from "@tanstack/react-query";

import { FormPage, StatusBadge, type StatusTone } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchPreferencesProfile } from "@/lib/preferences/api";

import { FactRow, FactRowsSkeleton, FormSection, LoadFailure } from "./form-parts";
import styles from "./organization.module.css";

/** `GOLD_MINE` is a database value. "Gold mine" is a word. */
function humanise(value: string) {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function tenantTone(status: string): StatusTone {
  if (status === "ACTIVE") return "success";
  if (status === "PROVISIONING") return "warn";
  return "danger";
}

/**
 * General — `General.dc.html`.
 *
 * The board draws eight editable fields across Identity and Locale, and a Save
 * footer under them. This page can write none of them.
 *
 * `PreferencesProfile["company"]` carries `name`, `slug`, `tenantStatus` and
 * `workspaceProfile`; `/api/preferences/profile` PATCHes the *user's* name and
 * phone and nothing about the company; and there is no company-settings route
 * anywhere in `app/api`. Country, reporting currency, timezone and week start
 * have no column behind them at all. Legal name, registration number and tax
 * number do exist — on `PUT /api/settings/branding`, which is the Branding
 * surface's endpoint and already draws those three fields on
 * `BrandingIdentity`. Editing them from here would mean a second query key
 * against somebody else's endpoint and the same fact editable in two places.
 *
 * So the page draws what it can prove and stays read-only. Drawing inputs and
 * a Save button over an API that cannot save is worse than drawing less.
 *
 * So the page keeps the board's frame exactly — 560px centred column, the
 * title line and its rule, bare section headings at `36px 0 14px` — and draws
 * the four facts it has in the row shape `Billing.dc.html` uses for the same
 * job. When a company-settings endpoint exists, the sections here become
 * `FormField`s and `FormPage` grows an `onSubmit`; nothing else moves.
 */
export function OrganizationOverviewPreferences() {
  const profileQuery = useQuery({
    queryKey: ["preferences", "profile"],
    queryFn: fetchPreferencesProfile,
  });

  const company = profileQuery.data?.company;

  return (
    <PreferencesShell>
      <FormPage title="General" className={styles.page}>
        {profileQuery.isLoading ? (
          <>
            <FormSection>Identity</FormSection>
            <FactRowsSkeleton rows={2} />
            <FormSection>Workspace</FormSection>
            <FactRowsSkeleton rows={2} />
          </>
        ) : !company ? (
          <LoadFailure
            message={getApiErrorMessage(profileQuery.error)}
            onRetry={() => {
              void profileQuery.refetch();
            }}
          />
        ) : (
          <>
            <FormSection>Identity</FormSection>
            <FactRow label="Name">{company.name}</FactRow>
            <FactRow label="Workspace slug" mono>
              {company.slug}
            </FactRow>

            <FormSection>Workspace</FormSection>
            <FactRow label="Profile">{humanise(company.workspaceProfile)}</FactRow>
            <FactRow label="Status">
              {/* Rule 5: no chip for a healthy default. An active tenant reads
                  as the word; anything else earns its colour. */}
              {tenantTone(company.tenantStatus) === "success" ? (
                humanise(company.tenantStatus)
              ) : (
                <StatusBadge tone={tenantTone(company.tenantStatus)}>
                  {humanise(company.tenantStatus)}
                </StatusBadge>
              )}
            </FactRow>
          </>
        )}
      </FormPage>
    </PreferencesShell>
  );
}
