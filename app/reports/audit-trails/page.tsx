"use client";

import { ActivityExportAction, ActivityLog } from "@/components/activity/activity-log";
import { FormPage } from "@/components/management/ui";

/**
 * Reports → Audit trails — the Analytics Pro view of the workspace's activity
 * log. The route keeps its gate (`reports.audit-trails` in
 * `lib/platform/gating/route-registry.ts`); the log is the one Settings →
 * Activity shows, read from `PlatformAuditEvent` a page at a time.
 *
 * It used to assemble its rows in the browser from three domain feeds — gold
 * corrections, stock movements and work orders, 500 of each — and filter what
 * had loaded. Every change in every module is now recorded as it happens, so
 * this reads the record instead.
 */
export default function AuditTrailsReportPage() {
  return (
    <FormPage width={620} title="Activity" action={<ActivityExportAction />}>
      <ActivityLog />
    </FormPage>
  );
}
