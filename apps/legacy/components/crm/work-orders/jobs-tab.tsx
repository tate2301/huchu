"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Progress } from "@corelithzw/ui/components/progress";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import type { RecordTab } from "@/components/records/record-page-shell";
import { fetchJson } from "@corelithzw/platform/api-client";
import { WORK_ORDER_STATUS } from "@/lib/crm/tones";
import { WORK_ORDER_STATUS_LABELS, type WorkOrderCounts } from "@/lib/crm/work-orders";
import { Plus, Wrench } from "@corelithzw/ui/lib/icons";

import { RaiseJobSheet } from "./raise-job-sheet";
import { jobHref, jobWindow, jobsRefParam, type JobRow, type JobsRef } from "./job-types";

export type JobsTab = {
  /** Drop straight into the page's `tabs` array. */
  tab: RecordTab;
  /**
   * Render beside the page's other sheets, not inside the section — only the
   * open section is mounted, and the actions menu raises a job from any of
   * them.
   */
  sheet: ReactNode;
  /** The one way a job is raised on this record. */
  raise: () => void;
};

/**
 * The work this record has turned into.
 *
 * A hook rather than a plain builder, because the section's badge has to know
 * how many jobs there are and whether any of them are in trouble before the
 * section is opened — `RecordTab` carries `count` and `attention`, and both
 * are read while the rail is drawn. `useRecordComments` in `record-tabs.tsx`
 * settles the same problem the same way: the page calls the hook
 * unconditionally at the top, and hands the result into its `tabs` array.
 *
 * The count is the API's own summary rather than the length of what came back,
 * so a record with more jobs than one page holds still badges honestly.
 */
export function useJobsTab({
  ref,
  currentUserId,
  /** Seeds the title of a job raised from here — usually the deal's own. */
  defaultTitle,
  quotationDocuments,
  links,
  onRaised,
}: {
  ref: JobsRef;
  currentUserId?: string;
  defaultTitle?: string;
  quotationDocuments?: { id: string; label: string }[];
  /**
   * The record's other ends, so a job raised here lands on all of them. The
   * create route stores only the ids it is handed — it does not read a deal's
   * company back out — so a job raised from a deal and given nothing else is
   * invisible on that deal's own customer.
   */
  links?: { dealId?: string | null; clientId?: string | null; siteId?: string | null };
  /** Open this section — the raised job is in it, and nowhere else on the page. */
  onRaised?: () => void;
}): JobsTab {
  const [raiseOpen, setRaiseOpen] = useState(false);

  const jobsQuery = useQuery({
    queryKey: ["crm", "jobs", ref.kind, ref.id],
    queryFn: () =>
      fetchJson<{ data: JobRow[]; summary?: WorkOrderCounts }>(
        `/api/v2/crm/work-orders?${jobsRefParam(ref)}&limit=100`,
      ),
  });

  const jobs = jobsQuery.data?.data ?? [];
  const summary = jobsQuery.data?.summary;

  // The same test the visits tab makes: a count says how much, and this says
  // whether it matters. Overdue-to-start and blocked are the two states that
  // need somebody, so they are the two that raise the dot.
  const attention = summary
    ? summary.overdue > 0 || summary.blocked > 0
    : jobs.some((job) => job.isOverdue || job.status === "BLOCKED");

  const sheet = (
    <RaiseJobSheet
      open={raiseOpen}
      onOpenChange={setRaiseOpen}
      dealId={ref.kind === "deal" ? ref.id : (links?.dealId ?? null)}
      clientId={ref.kind === "company" ? ref.id : (links?.clientId ?? null)}
      siteId={ref.kind === "site" ? ref.id : (links?.siteId ?? null)}
      defaultTitle={defaultTitle}
      quotationDocuments={quotationDocuments}
      currentUserId={currentUserId}
      onRaised={onRaised}
    />
  );

  const tab: RecordTab = {
    value: "jobs",
    label: "Jobs",
    icon: Wrench,
    count: summary?.total ?? jobs.length,
    attention,
    content: (
      <div className="space-y-3">
        {jobsQuery.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No work has been raised here"
            body="A job is what a won deal turns into — the checklist, the crew, the address and the sign-off."
            action={
              <Button size="sm" onClick={() => setRaiseOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Raise a job
              </Button>
            }
          />
        ) : (
          <>
            <ul className="border-t border-[var(--table-divider)]">
              {jobs.map((job) => (
                <li key={job.id} className="border-b border-[var(--table-divider)]">
                  <Link
                    href={jobHref(job.id)}
                    className="flex items-center gap-3 py-2.5 hover:bg-[var(--surface-hover)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-[var(--text-strong)]">
                          {job.title}
                        </span>
                        <span className="shrink-0 font-mono text-sm text-[var(--text-muted)]">
                          {job.workOrderNo}
                        </span>
                      </span>
                      <span className="block truncate text-sm text-[var(--text-muted)]">
                        {[
                          jobWindow(job.scheduledStart, job.scheduledEnd) ?? "Not booked",
                          job.assignedTo?.name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>

                    {/* A div rather than a span: `Progress` is a div, and a
                        block element inside an inline one is nesting the
                        browser silently rearranges. */}
                    {job.itemCount > 0 ? (
                      <div className="hidden w-28 shrink-0 items-center gap-2 sm:flex">
                        <Progress
                          value={job.completionPercent}
                          tone={job.completionPercent === 100 ? "success" : "brand"}
                          label={`${job.title} progress`}
                          className="min-w-0 flex-1"
                        />
                        <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-muted)]">
                          {job.completionPercent}%
                        </span>
                      </div>
                    ) : null}

                    {job.isOverdue ? (
                      <span className="shrink-0 text-sm font-medium text-[var(--badge-bad-fg)]">
                        Late
                      </span>
                    ) : null}

                    <StatusChip
                      status={WORK_ORDER_STATUS[job.status] ?? "inactive"}
                      label={WORK_ORDER_STATUS_LABELS[job.status]}
                    />
                  </Link>
                </li>
              ))}
            </ul>

            <Button variant="outline" size="sm" onClick={() => setRaiseOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Raise a job
            </Button>
          </>
        )}
      </div>
    ),
  };

  return { tab, sheet, raise: () => setRaiseOpen(true) };
}
