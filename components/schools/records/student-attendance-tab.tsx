"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, StatCard } from "@corelithzw/react";

import { LoadError, NothingYet, StatsSkeleton } from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { formatSchoolDate } from "@/lib/schools/format";

/**
 * How often this child is actually here.
 *
 * `/schools/attendance` answers the office's question — which classes have not
 * sent a register in this morning — and nothing answered the one anybody asks
 * about a particular pupil. A record page could show their guardians, their
 * enrolments and their bills and not whether they had been in school, which is
 * the first thing raised in a conversation about a child who is struggling.
 */

type EntryStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type AttendanceResponse = {
  counts: Record<EntryStatus, number>;
  marked: number;
  rate: number | null;
  recent: Array<{
    id: string;
    status: EntryStatus;
    remarks: string | null;
    date: string;
    className: string | null;
    streamName: string | null;
  }>;
};

const STATUS_LABEL: Record<EntryStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

const STATUS_TONE: Record<EntryStatus, "success" | "danger" | "warn" | "neutral"> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warn",
  EXCUSED: "neutral",
};

export function StudentAttendanceTab({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ["schools", "students", studentId, "attendance"],
    queryFn: () =>
      fetchJson<AttendanceResponse>(`/api/v2/schools/students/${studentId}/attendance`),
  });

  if (query.isPending) return <StatsSkeleton count={4} />;
  if (query.error) {
    return (
      <LoadError
        what="this pupil's attendance"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data || data.marked === 0) {
    return (
      <NothingYet
        title="No register has counted this pupil yet"
        body="Figures appear once a class teacher submits a register they are on. A register still in draft is not counted, because a percentage that moves while somebody is marking is one nobody can quote to a parent."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Attendance"
          value={<span className="tabular-nums">{data.rate}%</span>}
          tone={data.rate !== null && data.rate < 90 ? "warn" : "success"}
          footer={`of ${data.marked} registers taken`}
        />
        <StatCard
          label="Absent"
          value={<span className="tabular-nums">{data.counts.ABSENT}</span>}
          tone={data.counts.ABSENT > 0 ? "danger" : "neutral"}
          footer="Not accounted for"
        />
        <StatCard
          label="Late"
          value={<span className="tabular-nums">{data.counts.LATE}</span>}
          tone={data.counts.LATE > 0 ? "warn" : "neutral"}
          footer="Here, but after the bell"
        />
        <StatCard
          label="Excused"
          value={<span className="tabular-nums">{data.counts.EXCUSED}</span>}
          footer="Away with permission"
        />
      </div>

      <ul className="flex flex-col rounded-[var(--radius-lg)] border border-[color:var(--border)]">
        {data.recent.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-2.5 last:border-b-0"
          >
            <span className="w-[6.5rem] shrink-0 font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
              {formatSchoolDate(entry.date)}
            </span>
            <Badge tone={STATUS_TONE[entry.status]} dot className="w-[5.5rem] shrink-0">
              {STATUS_LABEL[entry.status]}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
              {[entry.className, entry.streamName].filter(Boolean).join(" · ") ||
                "No class recorded"}
            </span>
            {entry.remarks ? (
              <span className="truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                {entry.remarks}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
