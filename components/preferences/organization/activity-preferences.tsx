"use client";

import { ActivityExportAction, ActivityLog } from "@/components/activity/activity-log";
import { FormPage } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";

/**
 * Settings → Activity: the workspace's log for its admins, on every plan.
 * The same log as Reports → Audit trails; see `ActivityLog`.
 */
export function ActivityPreferences() {
  return (
    <PreferencesShell>
      <FormPage width={620} title="Activity" action={<ActivityExportAction />}>
        <ActivityLog />
      </FormPage>
    </PreferencesShell>
  );
}
