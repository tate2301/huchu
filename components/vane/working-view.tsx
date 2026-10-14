"use client";

import { Empty, Status, TableShell } from "@/components/core";
import type { VaneWorkRow } from "@/lib/vane/lists";

const when = (iso: string) => {
  const date = new Date(iso);
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** The job's state in the five words statuses use: Running, Not started, Idle (waiting to try again). */
function JobState({ job }: { job: VaneWorkRow }) {
  if (job.state === "running") return <Status tone="live">Running</Status>;
  if (job.state === "waiting") {
    return (
      <span style={{ display: "inline-flex", gap: "var(--space-8)", alignItems: "center" }}>
        <Status tone="warning">Idle</Status>
        {job.retryAt ? <span className="muted">tries again at {time(job.retryAt)}</span> : null}
      </span>
    );
  }
  return <Status>Not started</Status>;
}

/**
 * Working on (`/vane/working`, the tree): the jobs Vane is running now with
 * their progress, then those queued, then those waiting for the service.
 *
 * Pure: the page feeds it.
 */
export function WorkingView({ jobs }: { jobs: VaneWorkRow[] }) {
  if (jobs.length === 0) {
    return (
      <Empty icon="working" title="Vane is not working on anything">
        It looks over the workspace every morning at 06:00. Give it a job with Ctrl J and it shows here until it is done.
      </Empty>
    );
  }
  return (
    <div className="wt" style={{ flex: "none" }}>
      <TableShell label="What Vane is working on">
        <table className="table" style={{ minWidth: 760 }}>
          <colgroup>
            <col style={{ width: "50%" }} />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Job</th>
              <th>Started by</th>
              <th>State</th>
              <th className="num">Progress</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="fill">
                  <span className="cell-lead truncate" title={job.label} style={{ display: "block", maxWidth: "60ch" }}>
                    {job.label}
                  </span>
                </td>
                <td className="muted">{job.by}</td>
                <td>
                  <JobState job={job} />
                </td>
                <td className="num">{job.progress ?? "—"}</td>
                <td className="muted">{when(job.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
